#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CANARY_TITLE_PREFIX = '[BugDrop CI canary]';

const DEFAULT_API_BASE_URL = 'https://api.github.com';
const DEFAULT_LABELS = ['bug', 'bugdrop'];
const DEFAULT_AUTHOR = 'neonwatty-bugdrop[bot]';
const ATTRIBUTION_FOOTER = '*Submitted via [BugDrop](https://github.com/mean-weasel/bugdrop)*';

export function canaryTitle(marker) {
  requireNonempty(marker, 'marker');
  return `${CANARY_TITLE_PREFIX} ${marker}`;
}

export async function listMatchingIssues({
  fetchImpl = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  repo,
  token,
  marker,
  prefix,
}) {
  const selector = validateSelector({ marker, prefix });
  const issues = await listRepositoryIssues({ fetchImpl, apiBaseUrl, repo, token });
  return issues.filter(candidate => {
    if (candidate.pull_request) return false;
    if (selector.marker) {
      return (
        candidate.title?.includes(selector.marker) || candidate.body?.includes(selector.marker)
      );
    }
    return candidate.title?.startsWith(selector.prefix);
  });
}

export async function verifyCanaryIssue({
  fetchImpl = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  repo,
  token,
  marker,
  expectedSha,
  result,
  expectedLabels = DEFAULT_LABELS,
  expectedAuthor = DEFAULT_AUTHOR,
}) {
  requireNonempty(marker, 'marker');
  requireNonempty(expectedSha, 'expectedSha');
  const matches = await listMatchingIssues({
    fetchImpl,
    apiBaseUrl,
    repo,
    token,
    marker,
  });
  const numbers = matches.map(candidate => candidate.number);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one non-PR Issue for marker ${marker}; found ${matches.length} (${formatNumbers(numbers)})`
    );
  }

  const candidate = matches[0];
  const canonicalUrl = canonicalIssueUrl(repo, candidate.number);
  const failures = [];
  if (!Number.isInteger(candidate.number) || candidate.number <= 0) {
    failures.push('Issue number is not a positive integer');
  }
  if (candidate.html_url !== canonicalUrl) failures.push('Issue URL is not canonical');
  if (candidate.title !== canaryTitle(marker)) failures.push('Issue title does not match exactly');
  if (!candidate.body?.includes('## Description')) failures.push('Issue body lacks Description');
  if (!candidate.body?.includes(marker)) failures.push('Issue body lacks the CI marker');
  if (!candidate.body?.includes('<summary>System Info</summary>')) {
    failures.push('Issue body lacks System Info');
  }
  if (!candidate.body?.includes(ATTRIBUTION_FOOTER)) {
    failures.push('Issue body lacks BugDrop attribution');
  }
  if (candidate.body?.includes('## Screenshot')) failures.push('Issue contains a screenshot');
  if (candidate.state !== 'open') failures.push(`Issue state is ${candidate.state}, not open`);
  if (candidate.user?.login !== expectedAuthor) {
    failures.push(`Issue author is ${candidate.user?.login ?? 'missing'}, not ${expectedAuthor}`);
  }
  const actualLabels = normalizeLabels(candidate.labels);
  if (!sameStringSet(actualLabels, expectedLabels)) {
    failures.push(
      `Issue labels are [${actualLabels.join(', ')}], not [${[...expectedLabels].sort().join(', ')}]`
    );
  }

  validateBrowserResult({ failures, result, marker, expectedSha, candidate, canonicalUrl });
  if (failures.length > 0) {
    throw new Error(
      `Canary Issue #${candidate.number} failed verification: ${failures.join('; ')}`
    );
  }
  return candidate;
}

export async function closeMatchingIssues({
  fetchImpl = fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  repo,
  token,
  marker,
  prefix,
}) {
  const selector = validateSelector({ marker, prefix });
  const matches = await listMatchingIssues({
    fetchImpl,
    apiBaseUrl,
    repo,
    token,
    ...selector,
  });
  const closedNumbers = [];
  const failures = [];

  for (const candidate of matches.filter(issue => issue.state === 'open')) {
    try {
      await closeOneIssue({
        fetchImpl,
        apiBaseUrl,
        repo,
        token,
        number: candidate.number,
      });
      closedNumbers.push(candidate.number);
    } catch (error) {
      failures.push(`#${candidate.number}: ${safeErrorMessage(error, token)}`);
    }
  }

  const finalMatches = await listMatchingIssues({
    fetchImpl,
    apiBaseUrl,
    repo,
    token,
    ...selector,
  });
  const openNumbers = finalMatches
    .filter(candidate => candidate.state === 'open')
    .map(candidate => candidate.number);
  if (failures.length > 0 || openNumbers.length > 0) {
    const details = [
      ...failures,
      ...(openNumbers.length > 0
        ? [`still open after cleanup: ${formatNumbers(openNumbers)}`]
        : []),
    ];
    throw new Error(`Canary cleanup incomplete: ${details.join('; ')}`);
  }

  return {
    matchedNumbers: matches.map(candidate => candidate.number),
    closedNumbers,
    openNumbers,
  };
}

export async function runCli(
  argv,
  {
    fetchImpl = fetch,
    env = process.env,
    readFileImpl = readFile,
    stdout = value => process.stdout.write(`${value}\n`),
    stderr = value => process.stderr.write(`${value}\n`),
  } = {}
) {
  const token = env.BUGDROP_CANARY_GITHUB_TOKEN;
  try {
    const { command, options } = parseCliArguments(argv);
    requireNonempty(token, 'BUGDROP_CANARY_GITHUB_TOKEN');
    requireNonempty(options.repo, '--repo');
    let output;
    if (command === 'verify') {
      requireNonempty(options.marker, '--marker');
      requireNonempty(options.resultFile, '--result-file');
      requireNonempty(options.expectedSha, '--expected-sha');
      const result = JSON.parse(await readFileImpl(options.resultFile, 'utf8'));
      const candidate = await verifyCanaryIssue({
        fetchImpl,
        repo: options.repo,
        token,
        marker: options.marker,
        expectedSha: options.expectedSha,
        result,
      });
      output = { verified: true, issueNumber: candidate.number, issueUrl: candidate.html_url };
    } else if (command === 'cleanup') {
      requireNonempty(options.marker, '--marker');
      output = await closeMatchingIssues({
        fetchImpl,
        repo: options.repo,
        token,
        marker: options.marker,
      });
    } else if (command === 'preflight' || command === 'sweep') {
      requireNonempty(options.prefix, '--prefix');
      output = await closeMatchingIssues({
        fetchImpl,
        repo: options.repo,
        token,
        prefix: options.prefix,
      });
    } else {
      throw new Error(`Unknown command: ${command || '(missing)'}`);
    }
    stdout(JSON.stringify(output));
    return 0;
  } catch (error) {
    stderr(`[bugdrop-canary] ${safeErrorMessage(error, token)}`);
    return 1;
  }
}

async function listRepositoryIssues({ fetchImpl, apiBaseUrl, repo, token }) {
  const { owner, name } = parseRepo(repo);
  requireNonempty(token, 'token');
  const url = new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues`,
    apiBaseUrl
  );
  url.searchParams.set('state', 'all');
  url.searchParams.set('per_page', '100');
  let nextUrl = url.toString();
  const issues = [];
  while (nextUrl) {
    const { response, data } = await requestJson({ fetchImpl, url: nextUrl, token });
    if (!Array.isArray(data)) throw new Error('GitHub Issues response was not an array');
    issues.push(...data);
    nextUrl = parseNextLink(response.headers.get('link'));
  }
  return issues;
}

async function closeOneIssue({ fetchImpl, apiBaseUrl, repo, token, number }) {
  try {
    const updated = await patchIssueClosed({ fetchImpl, apiBaseUrl, repo, token, number });
    if (updated.state === 'closed') return;
    throw new Error(`PATCH returned state ${updated.state ?? 'missing'}`);
  } catch (firstError) {
    const afterFirst = await getIssue({ fetchImpl, apiBaseUrl, repo, token, number });
    if (afterFirst.state === 'closed') return;
    if (afterFirst.state !== 'open') {
      throw new Error(
        `Close was ambiguous and readback returned state ${afterFirst.state ?? 'missing'}: ${safeErrorMessage(firstError, token)}`
      );
    }
    try {
      const retried = await patchIssueClosed({ fetchImpl, apiBaseUrl, repo, token, number });
      if (retried.state === 'closed') return;
    } catch (retryError) {
      const afterRetry = await getIssue({ fetchImpl, apiBaseUrl, repo, token, number });
      if (afterRetry.state === 'closed') return;
      throw new Error(
        `Close retry failed and Issue remains ${afterRetry.state ?? 'unknown'}: ${safeErrorMessage(retryError, token)}`
      );
    }
    const afterRetry = await getIssue({ fetchImpl, apiBaseUrl, repo, token, number });
    if (afterRetry.state !== 'closed') {
      throw new Error(`Close retry returned but Issue remains ${afterRetry.state ?? 'unknown'}`);
    }
  }
}

async function patchIssueClosed({ fetchImpl, apiBaseUrl, repo, token, number }) {
  return (
    await requestJson({
      fetchImpl,
      url: issueApiUrl(apiBaseUrl, repo, number),
      token,
      method: 'PATCH',
      body: { state: 'closed', state_reason: 'not_planned' },
    })
  ).data;
}

async function getIssue({ fetchImpl, apiBaseUrl, repo, token, number }) {
  return (
    await requestJson({
      fetchImpl,
      url: issueApiUrl(apiBaseUrl, repo, number),
      token,
    })
  ).data;
}

async function requestJson({ fetchImpl, url, token, method = 'GET', body }) {
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
    throw new Error(`GitHub API ${method} request failed: ${safeErrorMessage(error, token)}`);
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `GitHub API ${method} ${redact(String(url), token)} returned ${response.status}: ${redact(text.slice(0, 500), token)}`
    );
  }
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`GitHub API ${method} returned invalid JSON`);
    }
  }
  return { response, data };
}

function validateBrowserResult({ failures, result, marker, expectedSha, candidate, canonicalUrl }) {
  if (!result || typeof result !== 'object') {
    failures.push('Browser result file is missing or invalid');
    return;
  }
  if (result.marker !== marker) failures.push('Browser result marker does not match');
  if (!Number.isInteger(result.issueNumber) || result.issueNumber <= 0) {
    failures.push('Browser result Issue number is not a positive integer');
  }
  if (result.issueNumber !== candidate.number) failures.push('Browser result Issue number differs');
  if (result.issueUrl !== canonicalUrl) failures.push('Browser result Issue URL differs');
  if (result.workerSha !== expectedSha) failures.push('Browser result Worker SHA differs');
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map(label => (typeof label === 'string' ? label : label?.name))
    .filter(label => typeof label === 'string')
    .sort();
}

function sameStringSet(left, right) {
  const normalizedRight = [...right].sort();
  return (
    left.length === normalizedRight.length &&
    left.every((value, index) => value === normalizedRight[index])
  );
}

function parseNextLink(value) {
  if (!value) return '';
  for (const segment of value.split(',')) {
    const match = segment.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2].split(/\s+/).includes('next')) return match[1];
  }
  return '';
}

function validateSelector({ marker, prefix }) {
  if (Boolean(marker) === Boolean(prefix)) {
    throw new Error('Exactly one of marker or prefix is required');
  }
  if (marker) return { marker: requireNonempty(marker, 'marker') };
  return { prefix: requireNonempty(prefix, 'prefix') };
}

function parseRepo(repo) {
  requireNonempty(repo, 'repo');
  const parts = repo.split('/');
  if (parts.length !== 2 || parts.some(part => !part.trim())) {
    throw new Error('repo must use owner/name format');
  }
  return { owner: parts[0], name: parts[1] };
}

function canonicalIssueUrl(repo, number) {
  parseRepo(repo);
  return `https://github.com/${repo}/issues/${number}`;
}

function issueApiUrl(apiBaseUrl, repo, number) {
  const { owner, name } = parseRepo(repo);
  if (!Number.isInteger(number) || number <= 0) throw new Error('Invalid Issue number');
  return new URL(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/issues/${number}`,
    apiBaseUrl
  ).toString();
}

function requireNonempty(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function safeErrorMessage(error, token) {
  return redact(error instanceof Error ? error.message : String(error), token);
}

function redact(value, token) {
  if (!token) return value;
  return value.split(token).join('[REDACTED]');
}

function formatNumbers(numbers) {
  return numbers.length > 0 ? numbers.map(number => `#${number}`).join(', ') : 'none';
}

function parseCliArguments(argv) {
  const command = argv[0] ?? '';
  const options = {};
  const names = {
    '--repo': 'repo',
    '--marker': 'marker',
    '--prefix': 'prefix',
    '--result-file': 'resultFile',
    '--expected-sha': 'expectedSha',
  };
  for (let index = 1; index < argv.length; index += 1) {
    const key = argv[index];
    const name = names[key];
    if (!name) throw new Error(`Unknown option: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  process.exitCode = await runCli(process.argv.slice(2));
}
