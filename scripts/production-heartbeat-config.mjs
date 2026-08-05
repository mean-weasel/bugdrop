#!/usr/bin/env node

import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const CANONICAL_REPOSITORY = 'mean-weasel/bugdrop';

export const CANONICAL_HEARTBEAT_CONFIG = Object.freeze({
  widgetOrigin: 'https://bugdrop.neonwatty.workers.dev',
  venueOrigin: 'https://bugdrop-widget-test.vercel.app',
  testRepo: 'mean-weasel/bugdrop-widget-test',
  expectedAuthor: 'neonwatty-bugdrop[bot]',
  expectedLabels: Object.freeze(['bug', 'bugdrop']),
});

const VARIABLE_NAMES = Object.freeze({
  widgetOrigin: 'BUGDROP_HEARTBEAT_WIDGET_ORIGIN',
  venueOrigin: 'BUGDROP_HEARTBEAT_VENUE_ORIGIN',
  testRepo: 'BUGDROP_HEARTBEAT_TEST_REPO',
  expectedAuthor: 'BUGDROP_HEARTBEAT_EXPECTED_AUTHOR',
  expectedLabels: 'BUGDROP_HEARTBEAT_EXPECTED_LABELS',
});

export function resolveProductionHeartbeatConfig({ repository, variables = {} }) {
  const currentRepository = repositorySlug(repository, 'GITHUB_REPOSITORY');
  const supplied = Object.fromEntries(
    Object.entries(VARIABLE_NAMES).map(([field, name]) => [field, text(variables[name])])
  );
  const hasOverrides = Object.values(supplied).some(Boolean);

  if (sameRepository(currentRepository, CANONICAL_REPOSITORY) && !hasOverrides) {
    return {
      ...CANONICAL_HEARTBEAT_CONFIG,
      expectedLabels: [...CANONICAL_HEARTBEAT_CONFIG.expectedLabels],
    };
  }

  const missing = Object.entries(VARIABLE_NAMES)
    .filter(([field]) => field !== 'expectedLabels' && !supplied[field])
    .map(([, name]) => name);
  if (missing.length > 0) {
    throw new Error(`Self-hosted heartbeat configuration is incomplete: ${missing.join(', ')}`);
  }

  const testRepo = repositorySlug(supplied.testRepo, VARIABLE_NAMES.testRepo);
  if (sameRepository(testRepo, currentRepository)) {
    throw new Error('BUGDROP_HEARTBEAT_TEST_REPO must be separate from GITHUB_REPOSITORY');
  }
  const widgetOrigin = httpsOrigin(supplied.widgetOrigin, VARIABLE_NAMES.widgetOrigin);
  const venueOrigin = httpsOrigin(supplied.venueOrigin, VARIABLE_NAMES.venueOrigin);
  if (widgetOrigin === venueOrigin) {
    throw new Error(
      'BUGDROP_HEARTBEAT_WIDGET_ORIGIN and BUGDROP_HEARTBEAT_VENUE_ORIGIN must differ'
    );
  }
  return {
    widgetOrigin,
    venueOrigin,
    testRepo,
    expectedAuthor: githubLogin(supplied.expectedAuthor, VARIABLE_NAMES.expectedAuthor),
    expectedLabels: labelList(supplied.expectedLabels || 'bug,bugdrop'),
  };
}

function sameRepository(left, right) {
  return left.toLowerCase() === right.toLowerCase();
}

export function heartbeatEnvironment(config, repository) {
  return {
    EXPECTED_WIDGET_ORIGIN: config.widgetOrigin,
    PLAYWRIGHT_BASE_URL: config.venueOrigin,
    BUGDROP_CANARY_REPO: config.testRepo,
    BUGDROP_CANARY_EXPECTED_AUTHOR: config.expectedAuthor,
    BUGDROP_CANARY_EXPECTED_LABELS_JSON: JSON.stringify(config.expectedLabels),
    BUGDROP_HEARTBEAT_INCIDENT_REPO: repositorySlug(repository, 'GITHUB_REPOSITORY'),
  };
}

function httpsOrigin(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
    throw new Error(`${name} must be an HTTPS origin without a path or credentials`);
  }
  return value;
}

function repositorySlug(value, name) {
  const normalized = text(value);
  const parts = normalized.split('/');
  if (
    parts.length !== 2 ||
    parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part) || part === '.' || part === '..')
  ) {
    throw new Error(`${name} must be an owner/repository slug`);
  }
  return normalized;
}

function githubLogin(value, name) {
  const normalized = text(value);
  if (!/^[A-Za-z0-9-]+(?:\[bot\])?$/.test(normalized)) {
    throw new Error(`${name} must be a GitHub login`);
  }
  return normalized;
}

function labelList(value) {
  const labels = value
    .split(',')
    .map(label => label.trim())
    .filter(Boolean);
  if (labels.length === 0 || labels.some(label => label.length > 50 || /[\r\n]/.test(label))) {
    throw new Error('BUGDROP_HEARTBEAT_EXPECTED_LABELS must be a comma-separated label list');
  }
  return [...new Set(labels)];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function main() {
  if (process.argv[2] !== 'export' || !process.env.GITHUB_ENV) {
    throw new Error('usage: production-heartbeat-config.mjs export (requires GITHUB_ENV)');
  }
  const config = resolveProductionHeartbeatConfig({
    repository: process.env.GITHUB_REPOSITORY,
    variables: process.env,
  });
  const entries = heartbeatEnvironment(config, process.env.GITHUB_REPOSITORY);
  await appendFile(
    process.env.GITHUB_ENV,
    `${Object.entries(entries)
      .map(([name, value]) => `${name}=${value}`)
      .join('\n')}\n`,
    'utf8'
  );
  process.stdout.write(
    `Production heartbeat configuration validated for ${process.env.GITHUB_REPOSITORY}.\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
