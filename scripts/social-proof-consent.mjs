import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildApprovedExport,
  buildCandidateReview,
  validateFingerprintKey,
  validateRegistry,
} from './social-proof-consent-lib.mjs';

const execFileAsync = promisify(execFile);
const INSTALLATION_PREFIX = 'installation:';
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readInstallationRecords() {
  const wrangler = resolve(REPOSITORY_ROOT, 'node_modules/.bin/wrangler');
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
      { cwd: REPOSITORY_ROOT, maxBuffer: 10 * 1024 * 1024 }
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
        { cwd: REPOSITORY_ROOT, maxBuffer: 1024 * 1024 }
      );
      records.push(JSON.parse(result.stdout));
    }
    return records;
  } catch {
    throw new Error('Unable to read installation records from Cloudflare KV');
  }
}

async function writePrivateFile(path, contents) {
  await writeFile(await privateOutputPath(path), contents, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
}

async function writePrivateJson(path, value) {
  await writePrivateFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function readRegistry(path) {
  const target = await privateInputPath(path);
  return validateRegistry(JSON.parse(await readFile(target, 'utf8')));
}

async function readFingerprintKey(path) {
  const target = await privateInputPath(path);
  const value = (await readFile(target, 'utf8')).trim();
  validateFingerprintKey(value);
  return value;
}

async function privateInputPath(path) {
  const target = await realpath(resolve(path));
  await assertOutsideRepository(target);
  const metadata = await stat(target);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    throw new Error('Private social proof inputs must be owner-only regular files');
  }
  return target;
}

async function privateOutputPath(path) {
  const parent = await realpath(dirname(resolve(path)));
  const target = join(parent, basename(path));
  await assertOutsideRepository(target);
  return target;
}

async function assertOutsideRepository(path) {
  const repository = await realpath(REPOSITORY_ROOT);
  const relation = relative(repository, path);
  if (relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))) {
    throw new Error('Private social proof files must be outside the repository');
  }
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

export async function runCli(args, dependencies = {}) {
  const readRecords = dependencies.readInstallationRecords ?? readInstallationRecords;
  const showReview =
    dependencies.showReview ?? (review => console.log(JSON.stringify(review, null, 2)));
  const [command, ...rawOptions] = args;
  const options = parseOptions(rawOptions);

  if (command === 'init' && options.registry && options.key) {
    const key = randomBytes(32).toString('base64url');
    await writePrivateFile(options.key, `${key}\n`);
    await writePrivateJson(options.registry, { schemaVersion: 1, entries: [] });
    return 'Created a private consent registry and account-fingerprint key.';
  }
  if (command === 'review' && options.registry && options.key && options.exclude) {
    const review = buildCandidateReview(
      await readRecords(),
      await readRegistry(options.registry),
      options.exclude
        .split(',')
        .map(value => value.trim())
        .filter(Boolean),
      await readFingerprintKey(options.key)
    );
    showReview(review);
    return `Reviewed ${review.candidates.length} outreach candidate(s) without saving identities.`;
  }
  if (command === 'export-approved' && options.registry && options.output) {
    const output = buildApprovedExport(await readRegistry(options.registry));
    await writePrivateJson(options.output, output);
    return `Created an approved-only public export with ${output.apps.length} app(s).`;
  }
  throw new Error('Usage: init|review|export-approved with the documented private-file options');
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runCli(process.argv.slice(2))
    .then(message => console.log(message))
    .catch(error => {
      console.error(error instanceof Error ? error.message : 'Social proof workflow failed');
      process.exitCode = 1;
    });
}
