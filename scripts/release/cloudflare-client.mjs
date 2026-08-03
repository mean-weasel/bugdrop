import { spawnSync } from 'node:child_process';

import {
  parseDeploymentStatus,
  parseVersionView,
  createWranglerPlan,
  executeWrangler,
} from './cloudflare-adapter.mjs';

const TOKEN = /^[A-Za-z0-9._-]{16,4096}$/;
const ACCOUNT = /^[A-Za-z0-9_-]{8,128}$/;
const SAFE_ENV_KEYS = [
  'CI',
  'GITHUB_ACTIONS',
  'HOME',
  'LANG',
  'LC_ALL',
  'PATH',
  'RUNNER_TEMP',
  'TEMP',
  'TMP',
  'TMPDIR',
];

export class CloudflareClientError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, name: 'CloudflareClientError' });
  }
}

function credential(value, pattern, field) {
  if (!pattern.test(value ?? ''))
    throw new CloudflareClientError('CREDENTIAL_REQUIRED', `${field} is invalid`);
  return value;
}

function safeEnvironment(source) {
  return Object.fromEntries(
    SAFE_ENV_KEYS.filter(key => typeof source?.[key] === 'string').map(key => [key, source[key]])
  );
}

export function createProductionCloudflareClient({
  accountId,
  apiToken,
  baseEnv = process.env,
  spawn = spawnSync,
  ...planInput
}) {
  const plan = createWranglerPlan({
    ...planInput,
    environment: 'production',
    expectedTarget: 'bugdrop',
  });
  const commandEnv = {
    ...safeEnvironment(baseEnv),
    CLOUDFLARE_ACCOUNT_ID: credential(accountId, ACCOUNT, 'accountId'),
    CLOUDFLARE_API_TOKEN: credential(apiToken, TOKEN, 'apiToken'),
  };
  const securedSpawn = (executable, args, options) =>
    spawn(executable, args, { ...options, env: commandEnv });
  const execute = (command, parse) => executeWrangler(command, parse, securedSpawn);
  return {
    target: plan.target,
    environment: plan.environment,
    wranglerVersion: plan.wranglerVersion,
    inspectStatus: () => execute(plan.status, parseDeploymentStatus),
    inspectVersion: versionId =>
      execute(plan.viewVersion(versionId), value => parseVersionView(value, versionId)),
    deploy: () => execute(plan.deploy),
    rollback: (versionId, message) => execute(plan.rollback(versionId, message)),
  };
}
