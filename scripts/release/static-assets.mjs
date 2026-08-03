import { createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { canonicalHash, canonicalize } from './canonical-json.mjs';

const STATIC_PACKAGE_SCHEMA = 'bugdrop.static-package/v1';
const VERSIONS_SCHEMA = 'bugdrop.versions-manifest/v1';
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const GENERATED_PATTERN =
  /^(?:widget\.js|widget\.v[^/]+\.js|versions\.json|checksums\.sha256|static-package\.json)$/;

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export class ReleaseStaticError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'ReleaseStaticError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ReleaseStaticError(code, message, details);
}

function parseVersion(version, field = 'version') {
  const match = VERSION_PATTERN.exec(version ?? '');
  if (!match) fail('INVALID_VERSION', `${field} must be stable MAJOR.MINOR.PATCH`);
  const values = match.slice(1).map(Number);
  if (values.some(value => !Number.isSafeInteger(value))) {
    fail('INVALID_VERSION', `${field} exceeds safe integer bounds`);
  }
  return values;
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function timestamp(value, field = 'timestamp') {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value ?? '')) {
    fail('INVALID_TIMESTAMP', `${field} must be a normalized UTC second timestamp`);
  }
  if (new Date(value).toISOString().replace('.000Z', 'Z') !== value) {
    fail('INVALID_TIMESTAMP', `${field} is not a real UTC timestamp`);
  }
  return value;
}

function assertMatch(value, pattern, field, code = 'INVALID_INPUT') {
  if (!pattern.test(value ?? '')) fail(code, `${field} is invalid`);
  return value;
}

function normalizeRelative(path) {
  return path.split(sep).join('/');
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function listFiles(root, current = root) {
  if (!(await exists(current))) return [];
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const path = join(current, entry.name);
    const details = await lstat(path);
    if (details.isSymbolicLink()) fail('UNSAFE_SYMLINK', `static tree contains ${path}`);
    if (details.isDirectory()) files.push(...(await listFiles(root, path)));
    else if (details.isFile()) files.push(normalizeRelative(relative(root, path)));
    else fail('UNEXPECTED_STATIC_ENTRY', `unsupported static entry ${path}`);
  }
  return files.sort(compareText);
}

async function assertNoGeneratedFiles(root, code) {
  const generated = (await listFiles(root)).filter(path => GENERATED_PATTERN.test(basename(path)));
  if (generated.length > 0) fail(code, `generated output already exists: ${generated.join(', ')}`);
}

async function copyStaticTree(sourceDir, outputDir) {
  const source = resolve(sourceDir);
  const output = resolve(outputDir);
  await assertNoGeneratedFiles(source, 'UNEXPECTED_GENERATED_INPUT');
  if (source === output) {
    await assertNoGeneratedFiles(output, 'DIRTY_OUTPUT');
    return;
  }
  if (await exists(output)) {
    const entries = await readdir(output);
    if (entries.length > 0) fail('DIRTY_OUTPUT', `output directory is not empty: ${output}`);
  }
  await mkdir(output, { recursive: true });
  for (const file of await listFiles(source)) {
    const destination = join(output, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(source, file), destination);
  }
}

async function prepareDevelopmentTree(sourceDir, outputDir) {
  const source = resolve(sourceDir);
  const output = resolve(outputDir);
  if (source === output) {
    for (const file of await listFiles(output)) {
      if (GENERATED_PATTERN.test(basename(file))) await rm(join(output, file));
    }
    return;
  }
  await copyStaticTree(source, output);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function hashFile(path) {
  return sha256(await readFile(path));
}

async function hashTree(root) {
  return Object.fromEntries(
    await Promise.all(
      (await listFiles(root)).map(async path => [path, await hashFile(join(root, path))])
    )
  );
}

async function loadArchive(record) {
  if (record.assetPath) return readFile(record.assetPath);
  if (!record.archiveUrl?.startsWith('https://')) {
    fail('INVALID_ARCHIVE_URL', `retained v${record.version} lacks an HTTPS archive`);
  }
  const response = await fetch(record.archiveUrl, { redirect: 'error' });
  if (!response.ok)
    fail('ARCHIVE_DOWNLOAD_FAILED', `${record.archiveUrl} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function stageRetainedAssets(input, outputDir) {
  const expected = [...input.expectedRetainedVersions];
  const cutover = input.cutoverVersion;
  const current = input.version;
  expected.forEach(version => {
    parseVersion(version, 'expected retained version');
    if (compareVersions(version, cutover) < 0) {
      fail('BEFORE_RETENTION_CUTOVER', `v${version} predates v${cutover}`);
    }
    if (compareVersions(version, current) >= 0) {
      fail('INVALID_RETAINED_VERSION', `v${version} is not older than v${current}`);
    }
  });
  if (new Set(expected).size !== expected.length) {
    fail('DUPLICATE_RETAINED_ASSET', 'expected retained versions contain duplicates');
  }
  const records = input.retainedReleases;
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.version)) fail('DUPLICATE_RETAINED_ASSET', `duplicate v${record.version}`);
    seen.add(record.version);
  }
  if (canonicalize([...seen].sort()) !== canonicalize([...expected].sort())) {
    fail('RETAINED_SET_MISMATCH', 'retained archives do not match the declared complete set');
  }
  const artifacts = {};
  for (const record of records.sort((left, right) =>
    compareVersions(left.version, right.version)
  )) {
    assertMatch(record.targetSha, SHA_PATTERN, `v${record.version} target SHA`);
    assertMatch(record.sha256, DIGEST_PATTERN, `v${record.version} SHA-256`);
    timestamp(record.publishedAt, `v${record.version} publication timestamp`);
    if (!record.archiveUrl?.startsWith('https://')) {
      fail('INVALID_ARCHIVE_URL', `v${record.version} archive URL must be HTTPS`);
    }
    const bytes = await loadArchive(record);
    const actual = sha256(bytes);
    if (actual !== record.sha256) {
      fail('RETAINED_HASH_MISMATCH', `v${record.version} expected ${record.sha256}, got ${actual}`);
    }
    const filename = `widget.v${record.version}.js`;
    await writeFile(join(outputDir, filename), bytes, { flag: 'wx' });
    artifacts[`v${record.version}`] = {
      archiveUrl: record.archiveUrl,
      filename,
      publishedAt: record.publishedAt,
      sha256: actual,
      targetSha: record.targetSha,
    };
  }
  return artifacts;
}

function validatePackageInput(input) {
  parseVersion(input.version);
  parseVersion(input.cutoverVersion, 'cutoverVersion');
  if (compareVersions(input.cutoverVersion, input.version) > 0) {
    fail('INVALID_RETENTION_CUTOVER', 'cutover cannot be newer than the current version');
  }
  timestamp(input.timestamp);
  assertMatch(input.targetSha, SHA_PATTERN, 'targetSha');
  assertMatch(input.sourceDigest, DIGEST_PATTERN, 'sourceDigest');
  assertMatch(input.controllerIdentity, IDENTITY_PATTERN, 'controllerIdentity');
  assertMatch(input.toolIdentity, IDENTITY_PATTERN, 'toolIdentity');
  if (!/^[^/\s]+\/[^/\s]+$/.test(input.repository ?? '')) {
    fail('INVALID_INPUT', 'repository must be owner/name');
  }
  if (!input.currentArchiveUrl?.startsWith('https://')) {
    fail('INVALID_ARCHIVE_URL', 'current archive URL must be HTTPS');
  }
  if (!Buffer.isBuffer(input.bundleBytes) || input.bundleBytes.length === 0) {
    fail('INVALID_INPUT', 'bundleBytes must be a non-empty Buffer');
  }
}

export async function createReleaseStaticPackage(input) {
  validatePackageInput(input);
  await copyStaticTree(input.sourcePublicDir, input.outputDir);
  const [major, minor] = parseVersion(input.version);
  const exactFilename = `widget.v${input.version}.js`;
  const aliases = [
    'widget.js',
    `widget.v${major}.js`,
    `widget.v${major}.${minor}.js`,
    exactFilename,
  ];
  for (const filename of aliases)
    await writeFile(join(input.outputDir, filename), input.bundleBytes, { flag: 'wx' });
  const artifacts = await stageRetainedAssets(input, input.outputDir);
  const bundleHash = sha256(input.bundleBytes);
  artifacts[`v${input.version}`] = {
    archiveUrl: input.currentArchiveUrl,
    filename: exactFilename,
    publishedAt: input.timestamp,
    sha256: bundleHash,
    targetSha: input.targetSha,
  };
  const versions = Object.fromEntries(
    [
      ...Object.values(artifacts).map(artifact => [
        `v${artifact.filename.slice(8, -3)}`,
        artifact.filename,
      ]),
      [`v${major}`, `widget.v${major}.js`],
      [`v${major}.${minor}`, `widget.v${major}.${minor}.js`],
    ].sort(([left], [right]) => compareText(left, right))
  );
  const manifest = {
    artifacts,
    authoritative: true,
    current: input.version,
    cutoverVersion: input.cutoverVersion,
    generatedAt: input.timestamp,
    latest: 'widget.js',
    mode: 'release',
    repository: input.repository,
    schema: VERSIONS_SCHEMA,
    versions,
  };
  await writeFile(join(input.outputDir, 'versions.json'), `${canonicalize(manifest)}\n`, {
    flag: 'wx',
  });
  const metadata = {
    controllerIdentity: input.controllerIdentity,
    mode: 'release',
    schema: STATIC_PACKAGE_SCHEMA,
    sourceDigest: input.sourceDigest,
    targetSha: input.targetSha,
    timestamp: input.timestamp,
    toolIdentity: input.toolIdentity,
    version: input.version,
  };
  await writeFile(join(input.outputDir, 'static-package.json'), `${canonicalize(metadata)}\n`, {
    flag: 'wx',
  });
  const checksummedFiles = await hashTree(input.outputDir);
  const checksums = Object.entries(checksummedFiles)
    .map(([path, hash]) => `${hash}  ${path}`)
    .join('\n');
  await writeFile(join(input.outputDir, 'checksums.sha256'), `${checksums}\n`, { flag: 'wx' });
  const fileHashes = await hashTree(input.outputDir);
  return {
    contentIdentity: canonicalHash({ schema: STATIC_PACKAGE_SCHEMA, fileHashes }),
    fileHashes,
    outputDir: input.outputDir,
  };
}

export async function createDevelopmentStaticPackage(input) {
  if (!Buffer.isBuffer(input.bundleBytes) || input.bundleBytes.length === 0) {
    fail('INVALID_INPUT', 'bundleBytes must be a non-empty Buffer');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input.developmentId ?? '')) {
    fail('INVALID_DEVELOPMENT_ID', 'developmentId must be a visible stable identifier');
  }
  await prepareDevelopmentTree(input.sourcePublicDir, input.outputDir);
  await mkdir(input.outputDir, { recursive: true });
  await writeFile(join(input.outputDir, 'widget.js'), input.bundleBytes, { flag: 'wx' });
  const manifest = {
    authoritative: false,
    current: `development:${input.developmentId}`,
    latest: 'widget.js',
    mode: 'development',
    schema: VERSIONS_SCHEMA,
    versions: { development: 'widget.js' },
  };
  await writeFile(join(input.outputDir, 'versions.json'), `${canonicalize(manifest)}\n`, {
    flag: 'wx',
  });
  return { fileHashes: await hashTree(input.outputDir), outputDir: input.outputDir };
}

export function resolveStaticArtifactRetry(input) {
  assertMatch(input.expectedContentIdentity, IDENTITY_PATTERN, 'expectedContentIdentity');
  if (input.artifactStatus === 'available') {
    if (!input.artifactId || input.storedContentIdentity !== input.expectedContentIdentity) {
      fail(
        'ARTIFACT_IDENTITY_MISMATCH',
        'available artifact is not the planned immutable artifact'
      );
    }
    return { kind: 'reuse-artifact', artifactId: input.artifactId };
  }
  if (input.artifactStatus === 'expired') {
    if (input.rebuiltContentIdentity === input.expectedContentIdentity) {
      return { kind: 'rebuilt-exact', contentIdentity: input.rebuiltContentIdentity };
    }
    return { kind: 'new-plan-required', reason: 'content-identity-mismatch' };
  }
  fail('ARTIFACT_STATE_UNCERTAIN', `unsupported artifact status ${input.artifactStatus}`);
}
