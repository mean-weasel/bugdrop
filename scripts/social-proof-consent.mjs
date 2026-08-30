import { execFile } from 'node:child_process';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const INSTALLATION_PREFIX = 'installation:';
const STATUS_VALUES = new Set(['contacted', 'declined', 'approved', 'withdrawn']);

export function validateRegistry(value) {
  if (!isObject(value) || !hasExactKeys(value, ['schemaVersion', 'entries'])) {
    throw new Error('Invalid consent registry');
  }
  if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
    throw new Error('Invalid consent registry');
  }

  const ids = new Set();
  for (const entry of value.entries) {
    validateRegistryEntry(entry);
    if (ids.has(entry.installationId)) throw new Error('Duplicate consent registry entry');
    ids.add(entry.installationId);
  }
  return value;
}

export function buildCandidateReport(
  records,
  registry,
  excludedLogins,
  generatedAt = new Date().toISOString()
) {
  validateRegistry(registry);
  assertIsoDate(generatedAt);
  if (!Array.isArray(excludedLogins) || excludedLogins.length === 0) {
    throw new Error('At least one owned or test account must be excluded');
  }
  const excluded = new Set(excludedLogins.map(normalizeExcludedLogin));
  const decided = new Set(registry.entries.map(entry => entry.installationId));
  const candidates = records
    .map(validateInstallationRecord)
    .filter(
      record =>
        !decided.has(record.installationId) &&
        !excluded.has(record.account.login.toLocaleLowerCase('en-US'))
    )
    .sort((a, b) => a.installedAt.localeCompare(b.installedAt));

  return { schemaVersion: 1, generatedAt, candidates };
}

export function buildApprovedExport(registry, generatedAt = new Date().toISOString()) {
  validateRegistry(registry);
  assertIsoDate(generatedAt);
  const apps = registry.entries
    .filter(entry => entry.status === 'approved')
    .map(entry => ({ ...entry.approval.publicProfile }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { schemaVersion: 1, generatedAt, apps };
}

async function readInstallationRecords() {
  const wrangler = resolve('node_modules/.bin/wrangler');
  try {
    const listed = await execFileAsync(
      wrangler,
      [
        'kv',
        'key',
        'list',
        '--binding',
        'INSTALLATION_ANALYTICS',
        '--env',
        'production',
        '--remote',
      ],
      { maxBuffer: 10 * 1024 * 1024 }
    );
    const keys = JSON.parse(listed.stdout);
    if (!Array.isArray(keys)) throw new Error('invalid list');

    const records = [];
    for (const item of keys) {
      if (!isObject(item) || typeof item.name !== 'string') throw new Error('invalid key');
      if (!item.name.startsWith(INSTALLATION_PREFIX)) continue;
      const result = await execFileAsync(
        wrangler,
        [
          'kv',
          'key',
          'get',
          item.name,
          '--binding',
          'INSTALLATION_ANALYTICS',
          '--env',
          'production',
          '--remote',
          '--text',
        ],
        { maxBuffer: 1024 * 1024 }
      );
      records.push(JSON.parse(result.stdout));
    }
    return records;
  } catch {
    throw new Error('Unable to read installation records from Cloudflare KV');
  }
}

async function writePrivateJson(path, value) {
  await writeFile(await privateOutputPath(path), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

async function readRegistry(path) {
  const target = await realpath(resolve(path));
  await assertOutsideRepository(target);
  return validateRegistry(JSON.parse(await readFile(target, 'utf8')));
}

async function privateOutputPath(path) {
  const parent = await realpath(dirname(resolve(path)));
  const target = join(parent, basename(path));
  await assertOutsideRepository(target);
  return target;
}

async function assertOutsideRepository(path) {
  const repository = await realpath(process.cwd());
  const relation = relative(repository, path);
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) {
    throw new Error('Private social proof files must be outside the repository');
  }
}

function validateRegistryEntry(entry) {
  if (!isObject(entry) || !STATUS_VALUES.has(entry.status)) {
    throw new Error('Invalid consent registry entry');
  }
  assertPositiveInteger(entry.installationId);
  assertIsoDate(entry.updatedAt);

  const expected =
    entry.status === 'approved'
      ? ['installationId', 'status', 'updatedAt', 'approval']
      : ['installationId', 'status', 'updatedAt'];
  if (!hasExactKeys(entry, expected)) throw new Error('Invalid consent registry entry');
  if (entry.status === 'approved') validateApproval(entry.approval);
}

function validateApproval(approval) {
  if (
    !isObject(approval) ||
    !hasExactKeys(approval, [
      'approvedAt',
      'authorizedRepresentativeConfirmed',
      'evidenceReference',
      'publicProfile',
    ]) ||
    approval.authorizedRepresentativeConfirmed !== true ||
    typeof approval.evidenceReference !== 'string' ||
    approval.evidenceReference.trim() === ''
  ) {
    throw new Error('Invalid social proof approval');
  }
  assertIsoDate(approval.approvedAt);
  validatePublicProfile(approval.publicProfile);
}

function validatePublicProfile(profile) {
  if (!isObject(profile)) throw new Error('Invalid approved public profile');
  const allowed = ['displayName', 'url', 'logoUrl', 'quote', 'attribution'];
  const keys = Object.keys(profile);
  if (
    !keys.includes('displayName') ||
    !keys.includes('url') ||
    keys.some(key => !allowed.includes(key))
  ) {
    throw new Error('Invalid approved public profile');
  }
  for (const key of keys) {
    if (typeof profile[key] !== 'string' || profile[key].trim() === '') {
      throw new Error('Invalid approved public profile');
    }
  }
  assertHttpUrl(profile.url);
  if (profile.logoUrl) assertHttpUrl(profile.logoUrl);
}

function validateInstallationRecord(record) {
  if (
    !isObject(record) ||
    !hasExactKeys(record, ['schemaVersion', 'installationId', 'account', 'installedAt']) ||
    record.schemaVersion !== 1 ||
    !isObject(record.account) ||
    !hasExactKeys(record.account, ['login', 'type', 'profileUrl']) ||
    typeof record.account.login !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/.test(record.account.login) ||
    !['User', 'Organization'].includes(record.account.type)
  ) {
    throw new Error('Invalid installation record');
  }
  assertPositiveInteger(record.installationId);
  assertIsoDate(record.installedAt);
  const expectedUrl = `https://github.com/${record.account.login}`;
  if (![expectedUrl, `${expectedUrl}/`].includes(record.account.profileUrl)) {
    throw new Error('Invalid installation record');
  }
  return record;
}

function hasExactKeys(value, expected) {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid installation ID');
}

function assertIsoDate(value) {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) {
    throw new Error('Invalid timestamp');
  }
}

function assertHttpUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid public URL');
  }
}

function normalizeExcludedLogin(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/.test(value)) {
    throw new Error('Invalid excluded account');
  }
  return value.toLocaleLowerCase('en-US');
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error('Invalid command options');
    options[name.slice(2)] = value;
  }
  return options;
}

export async function runCli(args) {
  const [command, ...rawOptions] = args;
  const options = parseOptions(rawOptions);
  if (command === 'init' && options.output) {
    await writePrivateJson(options.output, { schemaVersion: 1, entries: [] });
    return 'Created an empty private consent registry.';
  }
  if (command === 'prepare' && options.registry && options.output) {
    const report = buildCandidateReport(
      await readInstallationRecords(),
      await readRegistry(options.registry),
      options.exclude
        ?.split(',')
        .map(value => value.trim())
        .filter(Boolean) ?? []
    );
    await writePrivateJson(options.output, report);
    return `Created a private outreach report with ${report.candidates.length} candidate(s).`;
  }
  if (command === 'export-approved' && options.registry && options.output) {
    const output = buildApprovedExport(await readRegistry(options.registry));
    await writePrivateJson(options.output, output);
    return `Created an approved-only public export with ${output.apps.length} app(s).`;
  }
  throw new Error(
    'Usage: init|prepare|export-approved with --registry, --output, and prepare --exclude'
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2))
    .then(message => console.log(message))
    .catch(error => {
      console.error(error instanceof Error ? error.message : 'Social proof workflow failed');
      process.exitCode = 1;
    });
}
