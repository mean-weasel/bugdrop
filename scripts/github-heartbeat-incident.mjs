#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const INCIDENT_REPO = 'mean-weasel/bugdrop';
export const INCIDENT_TITLE = '[BugDrop production heartbeat] Incident';

const API_BASE = 'https://api.github.com';
const GITHUB_GET_RETRY_DELAYS_MS = [1_000, 2_000];

class GitHubRequestError extends Error {
  constructor(category, message, { retryable = false } = {}) {
    super(`${category}: ${message}`);
    this.name = 'GitHubRequestError';
    this.category = category;
    this.retryable = retryable;
  }
}

export async function transitionHeartbeatIncident({
  fetchImpl = fetch,
  token,
  outcome,
  runUrl,
  details,
  reasonCode,
  apiBaseUrl = API_BASE,
  repo = INCIDENT_REPO,
  retrySleepImpl = sleep,
}) {
  requireToken(token);
  if (!['failure', 'recovery', 'inconclusive'].includes(outcome)) {
    throw new Error('outcome must be failure, recovery, or inconclusive');
  }
  if (outcome === 'inconclusive') return { action: 'none', state: 'unchanged' };
  const body = incidentComment({ outcome, runUrl, details, reasonCode });
  let matches = await listIncidents({ fetchImpl, token, apiBaseUrl, repo, retrySleepImpl });
  if (matches.length > 1) {
    throw new Error(`Expected at most one heartbeat incident; found ${matches.length}`);
  }
  let incident = matches[0];

  if (outcome === 'failure' && !incident) {
    incident = await mutateAndReconcile({
      mutate: () =>
        requestJson({
          fetchImpl,
          token,
          url: issuesUrl(apiBaseUrl, repo),
          method: 'POST',
          body: { title: INCIDENT_TITLE, body },
        }),
      reconcile: async () => {
        matches = await listIncidents({ fetchImpl, token, apiBaseUrl, repo, retrySleepImpl });
        return matches.length === 1 ? matches[0] : undefined;
      },
      token,
      operation: 'create incident',
    });
    return { action: 'created', issueNumber: incident.number, state: incident.state };
  }
  if (!incident) return { action: 'none', state: 'absent' };

  if (outcome === 'failure' && incident.state === 'closed') {
    incident = await setIssueState({
      fetchImpl,
      token,
      apiBaseUrl,
      repo,
      number: incident.number,
      state: 'open',
      retrySleepImpl,
    });
    await addComment({
      fetchImpl,
      token,
      apiBaseUrl,
      repo,
      number: incident.number,
      body,
      retrySleepImpl,
    });
    return { action: 'reopened', issueNumber: incident.number, state: incident.state };
  }
  if (outcome === 'failure') {
    await addComment({
      fetchImpl,
      token,
      apiBaseUrl,
      repo,
      number: incident.number,
      body,
      retrySleepImpl,
    });
    return { action: 'updated', issueNumber: incident.number, state: incident.state };
  }
  if (incident.state === 'closed') {
    return { action: 'none', issueNumber: incident.number, state: incident.state };
  }
  await addComment({
    fetchImpl,
    token,
    apiBaseUrl,
    repo,
    number: incident.number,
    body,
    retrySleepImpl,
  });
  incident = await setIssueState({
    fetchImpl,
    token,
    apiBaseUrl,
    repo,
    number: incident.number,
    state: 'closed',
    retrySleepImpl,
  });
  return { action: 'closed', issueNumber: incident.number, state: incident.state };
}

export async function listIncidents({
  fetchImpl = fetch,
  token,
  apiBaseUrl = API_BASE,
  repo = INCIDENT_REPO,
  retrySleepImpl = sleep,
}) {
  requireToken(token);
  let next = new URL(issuesUrl(apiBaseUrl, repo));
  next.searchParams.set('state', 'all');
  next.searchParams.set('per_page', '100');
  const matches = [];
  while (next) {
    const { response, data } = await requestJson({
      fetchImpl,
      token,
      url: next.toString(),
      retrySleepImpl,
    });
    if (!Array.isArray(data)) {
      throw new GitHubRequestError(
        'github_response_invalid',
        'GitHub Issues response was not an array'
      );
    }
    matches.push(...data.filter(issue => !issue.pull_request && issue.title === INCIDENT_TITLE));
    next = nextLink(response.headers.get('link'));
  }
  return matches;
}

async function addComment({ fetchImpl, token, apiBaseUrl, repo, number, body, retrySleepImpl }) {
  await mutateAndReconcile({
    mutate: () =>
      requestJson({
        fetchImpl,
        token,
        url: `${issueUrl(apiBaseUrl, repo, number)}/comments`,
        method: 'POST',
        body: { body },
      }),
    reconcile: async () => {
      let next = new URL(`${issueUrl(apiBaseUrl, repo, number)}/comments`);
      next.searchParams.set('per_page', '100');
      while (next) {
        const { response, data } = await requestJson({
          fetchImpl,
          token,
          url: next.toString(),
          retrySleepImpl,
        });
        if (Array.isArray(data) && data.some(comment => comment.body === body)) return true;
        next = nextLink(response.headers.get('link'));
      }
      return undefined;
    },
    token,
    operation: 'comment on incident',
  });
}

async function setIssueState({
  fetchImpl,
  token,
  apiBaseUrl,
  repo,
  number,
  state,
  retrySleepImpl,
}) {
  return mutateAndReconcile({
    mutate: () =>
      requestJson({
        fetchImpl,
        token,
        url: issueUrl(apiBaseUrl, repo, number),
        retrySleepImpl,
        method: 'PATCH',
        body: { state, ...(state === 'closed' ? { state_reason: 'completed' } : {}) },
      }),
    reconcile: async () => {
      const { data } = await requestJson({
        fetchImpl,
        token,
        url: issueUrl(apiBaseUrl, repo, number),
      });
      return data?.state === state ? data : undefined;
    },
    token,
    operation: `${state} incident`,
  });
}

async function mutateAndReconcile({ mutate, reconcile, token, operation }) {
  try {
    const { data } = await mutate();
    return data;
  } catch (error) {
    if (!isAmbiguousMutationError(error)) throw error;
    try {
      const reconciled = await reconcile();
      if (reconciled) return reconciled;
    } catch (reconcileError) {
      throw new Error(
        `${operation} failed and reconciliation failed: ${safe(error, token)}; ${safe(reconcileError, token)}`
      );
    }
    throw new Error(`${operation} failed and could not be reconciled: ${safe(error, token)}`);
  }
}

function isAmbiguousMutationError(error) {
  return (
    error instanceof GitHubRequestError &&
    ['github_network', 'github_5xx', 'github_response_invalid'].includes(error.category)
  );
}

async function requestJson({
  fetchImpl,
  token,
  url,
  method = 'GET',
  body,
  retrySleepImpl = sleep,
}) {
  if (method !== 'GET') return requestJsonOnce({ fetchImpl, token, url, method, body });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestJsonOnce({ fetchImpl, token, url, method, body });
    } catch (error) {
      if (!(error instanceof GitHubRequestError) || !error.retryable || attempt === 2) throw error;
      await retrySleepImpl(GITHUB_GET_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw new GitHubRequestError('github_request_failed', 'GitHub GET retry bound exhausted');
}

async function requestJsonOnce({ fetchImpl, token, url, method = 'GET', body }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    throw new GitHubRequestError('github_network', `GitHub ${method} request failed [REDACTED]`, {
      retryable: method === 'GET',
    });
  }
  const text = await response.text();
  if (!response.ok) {
    throw githubResponseError(response, method);
  }
  if (!text) return { response, data: null };
  try {
    return { response, data: JSON.parse(text) };
  } catch {
    throw new GitHubRequestError(
      'github_response_invalid',
      `GitHub ${method} returned invalid JSON`
    );
  }
}

function githubResponseError(response, method) {
  const status = response.status;
  if ((status === 403 || status === 429) && isRateLimited(response)) {
    return new GitHubRequestError('github_rate_limited', `GitHub ${method} was rate limited`);
  }
  if (status === 401 || status === 403) {
    return new GitHubRequestError(
      'github_auth',
      `GitHub ${method} authorization failed [REDACTED]`
    );
  }
  if ([500, 502, 503, 504].includes(status)) {
    return new GitHubRequestError('github_5xx', `GitHub ${method} returned ${status}`, {
      retryable: method === 'GET',
    });
  }
  return new GitHubRequestError('github_request_failed', `GitHub ${method} returned ${status}`);
}

function isRateLimited(response) {
  return (
    response.status === 429 ||
    response.headers.get('x-ratelimit-remaining') === '0' ||
    Boolean(response.headers.get('retry-after'))
  );
}

function sleep(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

function incidentComment({ outcome, runUrl, details, reasonCode }) {
  if (reasonCode) {
    return `Production heartbeat ${outcome}. Classification: ${requireReasonCode(reasonCode)}.`;
  }
  const safeRunUrl = requireText(runUrl, 'runUrl');
  const safeDetails = requireText(details, 'details');
  return [
    `Production heartbeat ${outcome}.`,
    '',
    `Run: ${safeRunUrl}`,
    '',
    `Details: ${safeDetails}`,
  ].join('\n');
}

function requireReasonCode(value) {
  const allowed = new Set([
    'issue_verified',
    'issue_absent',
    'issue_duplicate',
    'issue_contract_invalid',
  ]);
  if (!allowed.has(value)) throw new Error('invalid heartbeat reason code');
  return value;
}

function issuesUrl(apiBaseUrl, repo) {
  return new URL(`/repos/${repositoryPath(repo)}/issues`, apiBaseUrl).toString();
}

function issueUrl(apiBaseUrl, repo, number) {
  if (!Number.isInteger(number) || number < 1) throw new Error('invalid incident Issue number');
  return new URL(`/repos/${repositoryPath(repo)}/issues/${number}`, apiBaseUrl).toString();
}

function repositoryPath(repo) {
  const value = requireText(repo, 'incident repository');
  const match = value.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match || match.slice(1).some(part => part === '.' || part === '..')) {
    throw new Error('incident repository must be an owner/repository slug');
  }
  return `${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
}

function nextLink(value) {
  if (!value) return null;
  for (const segment of value.split(',')) {
    const match = segment.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2].split(/\s+/).includes('next')) return new URL(match[1]);
  }
  return null;
}

function requireToken(token) {
  return requireText(token, 'GITHUB_TOKEN');
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function safe(error, token) {
  return redact(error instanceof Error ? error.message : String(error), token);
}

function redact(value, token) {
  return token ? value.split(token).join('[REDACTED]') : value;
}

async function main() {
  const outcome = process.argv[2];
  const options = Object.fromEntries(
    process.argv.slice(3).reduce((pairs, value, index, values) => {
      if (index % 2 === 0) pairs.push([value, values[index + 1]]);
      return pairs;
    }, [])
  );
  const result = await transitionHeartbeatIncident({
    token: process.env.GITHUB_TOKEN,
    outcome,
    runUrl: options['--run-url'],
    details: options['--details'],
    reasonCode: options['--reason-code'],
    repo: process.env.BUGDROP_HEARTBEAT_INCIDENT_REPO || process.env.GITHUB_REPOSITORY,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`[bugdrop-heartbeat-incident] ${safe(error, process.env.GITHUB_TOKEN)}\n`);
    process.exitCode = 1;
  });
}
