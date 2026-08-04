#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, version as esbuildVersion } from 'esbuild';

import {
  createDevelopmentStaticPackage,
  createReleaseStaticPackage,
} from './release/static-assets.mjs';
import { canonicalize } from './release/canonical-json.mjs';
import { loadRetentionInput } from './release/retention.mjs';

const CONTROLLER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VALUE_OPTIONS = new Set([
  'mode',
  'source-dir',
  'output-dir',
  'version',
  'timestamp',
  'target-sha',
  'repository',
  'cutover-version',
  'retention-plan',
  'request-plan',
  'result-path',
  'current-archive-url',
  'controller-identity',
  'tool-identity',
  'source-digest',
  'development-id',
]);

function usage() {
  return `Usage: node scripts/build-widget.js [options]

Build modes:
  --mode development          Non-authoritative local/preview output (default)
  --mode release              Deterministic authoritative package

Common options:
  --source-dir PATH           Candidate checkout (default: repository root)
  --output-dir PATH           Clean output tree (default: <source>/public)
  --development-id ID         Visible identity for development output

Release options:
  --version MAJOR.MINOR.PATCH  Required planned stable version
  --timestamp UTC             Required fixed YYYY-MM-DDTHH:MM:SSZ
  --target-sha SHA            Candidate commit (derived from Git when omitted)
  --repository OWNER/NAME     Release repository (derived from Git when omitted)
  --retention-plan PATH       JSON declaration of retained exact-version assets
  --request-plan PATH         Approved request plan matching the retention input
  --result-path PATH          Write the complete builder-result identity outside the output tree
  --cutover-version VERSION   First retained exact version (default: current)
  --current-archive-url URL   Prospective exact-version release URL
  --controller-identity ID    sha256 identity (derived when omitted)
  --tool-identity ID          sha256 identity (derived when omitted)
  --source-digest DIGEST      Candidate source digest (derived when omitted)
  --help                      Show this help
`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help') return { help: true };
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!VALUE_OPTIONS.has(key)) throw new Error(`Unknown option: ${token}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} requires a value`);
    if (Object.hasOwn(options, key)) throw new Error(`${token} may only be provided once`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function option(options, key, environmentName, fallback) {
  return options[key] ?? process.env[environmentName] ?? fallback;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalized(path) {
  return path.split(sep).join('/');
}

async function listSourceFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  )) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...(await listSourceFiles(root, path)));
    else if (entry.isFile()) files.push(normalized(relative(root, path)));
    else throw new Error(`Unsupported candidate source entry: ${path}`);
  }
  return files;
}

async function treeDigest(root) {
  const hash = createHash('sha256');
  for (const file of await listSourceFiles(root)) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function controllerIdentity() {
  const paths = [
    fileURLToPath(import.meta.url),
    join(CONTROLLER_ROOT, 'scripts/release/canonical-json.mjs'),
    join(CONTROLLER_ROOT, 'scripts/release/static-assets.mjs'),
  ];
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(basename(path));
    hash.update('\0');
    hash.update(await readFile(path));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function git(sourceDir, args) {
  try {
    return execFileSync('git', ['-C', sourceDir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function repositoryFromRemote(remote) {
  const match = /(?:github\.com[/:])([^/]+\/[^/]+?)(?:\.git)?$/.exec(remote ?? '');
  return match?.[1];
}

async function bundleCandidate({ sourceDir, version, enableTestHooks }) {
  const entry = join(sourceDir, 'src/widget/index.ts');
  const result = await build({
    absWorkingDir: sourceDir,
    bundle: true,
    define: {
      __BUGDROP_ENABLE_TEST_HOOKS__: enableTestHooks ? 'true' : 'false',
      __BUGDROP_VERSION__: JSON.stringify(version),
    },
    entryPoints: [entry],
    format: 'iife',
    logLevel: 'silent',
    minify: true,
    outfile: 'widget.js',
    write: false,
  });
  if (result.outputFiles.length !== 1) throw new Error('Expected exactly one widget bundle output');
  const bytes = Buffer.from(result.outputFiles[0].contents);
  if (!enableTestHooks && bytes.includes('__bugdropMockToPng')) {
    throw new Error('Production widget build unexpectedly contains test screenshot hook');
  }
  return bytes;
}

async function loadRetentionPlan(path, requestPlanPath) {
  if (!path) return {};
  const resolved = resolve(path);
  const plan = JSON.parse(await readFile(resolved, 'utf8'));
  if (plan === null || Array.isArray(plan) || typeof plan !== 'object') {
    throw new Error('Retention plan must be a JSON object');
  }
  if (plan.schema === 'bugdrop.retention-input/v1') {
    if (!requestPlanPath) throw new Error('Authenticated retention input requires --request-plan');
    const requestBytes = await readFile(resolve(requestPlanPath));
    const requestPlan = JSON.parse(requestBytes.toString('utf8'));
    if (!requestBytes.equals(Buffer.from(`${canonicalize(requestPlan)}\n`))) {
      throw new Error('Request plan must be canonical JSON');
    }
    return loadRetentionInput(resolved, requestPlan.requestIdentity, requestPlan.retention);
  }
  return plan;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const mode = option(options, 'mode', 'BUGDROP_BUILD_MODE', 'development');
  if (mode !== 'development' && mode !== 'release')
    throw new Error(`Unsupported build mode: ${mode}`);
  const sourceDir = resolve(option(options, 'source-dir', 'BUGDROP_SOURCE_DIR', CONTROLLER_ROOT));
  const outputDir = resolve(
    option(options, 'output-dir', 'BUGDROP_OUTPUT_DIR', join(sourceDir, 'public'))
  );
  const enableTestHooks = process.env.BUGDROP_TEST_HOOKS === '1';

  if (mode === 'development') {
    const developmentId = option(options, 'development-id', 'BUGDROP_DEVELOPMENT_ID', 'local');
    const bundleBytes = await bundleCandidate({
      sourceDir,
      version: `development:${developmentId}`,
      enableTestHooks,
    });
    await createDevelopmentStaticPackage({
      bundleBytes,
      developmentId,
      outputDir,
      sourcePublicDir: join(sourceDir, 'public'),
    });
    process.stdout.write(`Built non-authoritative widget development:${developmentId}\n`);
    return;
  }

  if (enableTestHooks) throw new Error('Release mode forbids BUGDROP_TEST_HOOKS');
  const version = option(options, 'version', 'BUGDROP_VERSION');
  const timestamp = option(options, 'timestamp', 'BUGDROP_RELEASE_TIMESTAMP');
  if (!version) throw new Error('Release mode requires --version or BUGDROP_VERSION');
  if (!timestamp) throw new Error('Release mode requires --timestamp or BUGDROP_RELEASE_TIMESTAMP');

  const targetSha = option(
    options,
    'target-sha',
    'BUGDROP_TARGET_SHA',
    git(sourceDir, ['rev-parse', 'HEAD'])
  );
  const repository = option(
    options,
    'repository',
    'BUGDROP_REPOSITORY',
    repositoryFromRemote(git(sourceDir, ['remote', 'get-url', 'origin']))
  );
  const retention = await loadRetentionPlan(
    option(options, 'retention-plan', 'BUGDROP_RETENTION_PLAN'),
    option(options, 'request-plan', 'BUGDROP_REQUEST_PLAN')
  );
  const retentionMode = retention.mode ?? (retention.retainedReleases ? undefined : 'disabled');
  const bundleBytes = await bundleCandidate({ sourceDir, version, enableTestHooks: false });
  const exactName = `widget.v${version}.js`;
  const result = await createReleaseStaticPackage({
    bundleBytes,
    controllerIdentity:
      option(options, 'controller-identity', 'BUGDROP_CONTROLLER_IDENTITY') ??
      (await controllerIdentity()),
    currentArchiveUrl:
      option(options, 'current-archive-url', 'BUGDROP_CURRENT_ARCHIVE_URL') ??
      `https://github.com/${repository}/releases/download/v${version}/${exactName}`,
    cutoverVersion:
      option(options, 'cutover-version', 'BUGDROP_CUTOVER_VERSION') ??
      retention.cutoverVersion ??
      (retentionMode === 'disabled' ? null : version),
    expectedRetainedVersions: retention.expectedRetainedVersions ?? [],
    outputDir,
    repository,
    retainedReleases: retention.retainedReleases ?? [],
    retentionMode,
    sourceDigest:
      option(options, 'source-digest', 'BUGDROP_SOURCE_DIGEST') ??
      (await treeDigest(join(sourceDir, 'src/widget'))),
    sourcePublicDir: join(sourceDir, 'public'),
    targetSha,
    timestamp,
    toolIdentity:
      option(options, 'tool-identity', 'BUGDROP_TOOL_IDENTITY') ??
      `sha256:${sha256(`esbuild:${esbuildVersion}`)}`,
    version,
  });
  const resultPath = option(options, 'result-path', 'BUGDROP_BUILDER_RESULT');
  if (resultPath) {
    const builderResult = {
      schema: 'bugdrop.builder-result/v1',
      requestIdentity: retention.requestIdentity ?? null,
      staticPackage: result.staticPackage,
    };
    await writeFile(resolve(resultPath), `${canonicalize(builderResult)}\n`, { flag: 'wx' });
  }
  process.stdout.write(`Built authoritative widget v${version} (${result.contentIdentity})\n`);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
