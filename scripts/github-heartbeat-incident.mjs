#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const INCIDENT_REPO = 'mean-weasel/bugdrop';
export const INCIDENT_TITLE = '[BugDrop production heartbeat] Incident';

const API_BASE = 'https://api.github.com';

export async function transitionHeartbeatIncident({
  fetchImpl = fetch,
  token,
  outcome,
  runUrl,
  details,
  apiBaseUrl = API_BASE,
}) {
  requireToken(token);
  if (outcome !== 'failure' && outcome !== 'recovery') {
    throw new Error('outcome must be failure or recovery');
  }
  const body = incidentComment({ outcome, runUrl, details });
  let matches = await listIncidents({ fetchImpl, token, apiBaseUrl });
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
          url: issuesUrl(apiBaseUrl),
          method: 'POST',
          body: { title: INCIDENT_TITLE, body },
        }),
      reconcile: async () => {
        matches = await listIncidents({ fetchImpl, token, apiBaseUrl });
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
      number: incident.number,
      state: 'open',
    });
    await addComment({ fetchImpl, token, apiBaseUrl, number: incident.number, body });
    return { action: 'reopened', issueNumber: incident.number, state: incident.state };
  }
  if (outcome === 'failure') {
    await addComment({ fetchImpl, token, apiBaseUrl, number: incident.number, body });
    return { action: 'updated', issueNumber: incident.number, state: incident.state };
  }
  if (incident.state === 'closed') {
    return { action: 'none', issueNumber: incident.number, state: incident.state };
  }
  await addComment({ fetchImpl, token, apiBaseUrl, number: incident.number, body });
  incident = await setIssueState({
    fetchImpl,
    token,
    apiBaseUrl,
    number: incident.number,
    state: 'closed',
  });
  return { action: 'closed', issueNumber: incident.number, state: incident.state };
}

export async function listIncidents({ fetchImpl = fetch, token, apiBaseUrl = API_BASE }) {
  requireToken(token);
  let next = new URL(issuesUrl(apiBaseUrl));
  next.searchParams.set('state', 'all');
  next.searchParams.set('per_page', '100');
  const matches = [];
  while (next) {
    const { response, data } = await requestJson({ fetchImpl, token, url: next.toString() });
    if (!Array.isArray(data)) throw new Error('GitHub Issues response was not an array');
    matches.push(...data.filter(issue => !issue.pull_request && issue.title === INCIDENT_TITLE));
    next = nextLink(response.headers.get('link'));
  }
  return matches;
}

async function addComment({ fetchImpl, token, apiBaseUrl, number, body }) {
  await mutateAndReconcile({
    mutate: () =>
      requestJson({
        fetchImpl,
        token,
        url: `${issueUrl(apiBaseUrl, number)}/comments`,
        method: 'POST',
        body: { body },
      }),
    reconcile: async () => {
      let next = new URL(`${issueUrl(apiBaseUrl, number)}/comments`);
      next.searchParams.set('per_page', '100');
      while (next) {
        const { response, data } = await requestJson({
          fetchImpl,
          token,
          url: next.toString(),
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

async function setIssueState({ fetchImpl, token, apiBaseUrl, number, state }) {
  return mutateAndReconcile({
    mutate: () =>
      requestJson({
        fetchImpl,
        token,
        url: issueUrl(apiBaseUrl, number),
        method: 'PATCH',
        body: { state, ...(state === 'closed' ? { state_reason: 'completed' } : {}) },
      }),
    reconcile: async () => {
      const { data } = await requestJson({
        fetchImpl,
        token,
        url: issueUrl(apiBaseUrl, number),
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

async function requestJson({ fetchImpl, token, url, method = 'GET', body }) {
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
    throw new Error(`GitHub API request failed: ${safe(error, token)}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}: ${redact(text.slice(0, 500), token)}`);
  }
  if (!text) return { response, data: null };
  try {
    return { response, data: JSON.parse(text) };
  } catch {
    throw new Error('GitHub API returned invalid JSON');
  }
}

function incidentComment({ outcome, runUrl, details }) {
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

function issuesUrl(apiBaseUrl) {
  return new URL(`/repos/${INCIDENT_REPO}/issues`, apiBaseUrl).toString();
}

function issueUrl(apiBaseUrl, number) {
  if (!Number.isInteger(number) || number < 1) throw new Error('invalid incident Issue number');
  return new URL(`/repos/${INCIDENT_REPO}/issues/${number}`, apiBaseUrl).toString();
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
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`[bugdrop-heartbeat-incident] ${safe(error, process.env.GITHUB_TOKEN)}\n`);
    process.exitCode = 1;
  });
}
