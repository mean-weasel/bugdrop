#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { canonicalHash } from './canonical-json.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const MAX_HEALTH_BYTES = 64 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_WIDGET_BYTES = 16 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024;
const MAX_BASELINE_OBSERVATION_MS = 2 * 60 * 1000;

export class LiveVerificationError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, details, name: 'LiveVerificationError' });
  }
}
function fail(code, message, details) {
  throw new LiveVerificationError(code, message, details);
}
function match(value, pattern, field, code = 'INVALID_INPUT') {
  if (!pattern.test(value ?? '')) fail(code, `${field} is invalid`);
  return value;
}
function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('INVALID_ORIGIN', 'origin must be an HTTPS origin');
  }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
    fail('INVALID_ORIGIN', 'origin must be an HTTPS origin without path or credentials');
  }
  return value;
}
function normalizeHashMap(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_INPUT', `${field} must be an object`);
  }
  return Object.fromEntries(
    Object.entries(value).map(([name, digest]) => [
      match(name, ASSET_PATTERN, `${field} filename`),
      match(digest, DIGEST_PATTERN, `${field}.${name}`),
    ])
  );
}
function normalizeExpected(input) {
  const aliases = input?.aliasFilenames;
  if (!Array.isArray(aliases) || aliases.length === 0) {
    fail('INVALID_INPUT', 'aliasFilenames must be non-empty');
  }
  aliases.forEach(name => match(name, ASSET_PATTERN, 'alias filename'));
  if (new Set(aliases).size !== aliases.length) fail('INVALID_INPUT', 'alias filenames repeat');
  const version = match(input.version, VERSION_PATTERN, 'version', 'INVALID_VERSION');
  const [major, minor] = version.split('.');
  for (const required of ['widget.js', `widget.v${major}.js`, `widget.v${major}.${minor}.js`]) {
    if (!aliases.includes(required)) fail('INVALID_INPUT', `aliasFilenames lacks ${required}`);
  }
  const exactFilename = match(input.exactFilename, ASSET_PATTERN, 'exactFilename');
  if (exactFilename !== `widget.v${version}.js`) {
    fail('INVALID_INPUT', 'exactFilename does not match version');
  }
  return {
    aliasFilenames: aliases,
    exactFilename,
    manifestSha256: match(input.manifestSha256, DIGEST_PATTERN, 'manifestSha256'),
    origin: normalizeOrigin(input.origin),
    retainedAssets: normalizeHashMap(input.retainedAssets, 'retainedAssets'),
    targetSha: match(input.targetSha, SHA_PATTERN, 'targetSha', 'INVALID_SHA'),
    version,
    widgetSha256: match(input.widgetSha256, DIGEST_PATTERN, 'widgetSha256'),
  };
}
function observedHash(snapshot, filename) {
  return match(
    snapshot?.assetHashes?.[filename],
    DIGEST_PATTERN,
    `observed ${filename}`,
    'LIVE_IDENTITY_MISMATCH'
  );
}
function requireHash(snapshot, filename, expected) {
  const actual = observedHash(snapshot, filename);
  if (actual !== expected) {
    fail('LIVE_IDENTITY_MISMATCH', `${filename} expected ${expected}, observed ${actual}`);
  }
}
export function verifyLiveSnapshot(input, snapshot) {
  const expected = normalizeExpected(input);
  if (snapshot?.health?.status !== 'ok') fail('LIVE_HEALTH_MISMATCH', 'health is not ok');
  if (snapshot.health.environment !== 'production') {
    fail(
      'LIVE_ENVIRONMENT_MISMATCH',
      `expected production, observed ${snapshot.health.environment}`
    );
  }
  if (snapshot.health.buildSha !== expected.targetSha) {
    fail(
      'LIVE_BUILD_SHA_MISMATCH',
      `expected ${expected.targetSha}, observed ${snapshot.health.buildSha ?? '<missing>'}`
    );
  }
  requireHash(snapshot, expected.exactFilename, expected.widgetSha256);
  for (const alias of expected.aliasFilenames) requireHash(snapshot, alias, expected.widgetSha256);
  requireHash(snapshot, 'versions.json', expected.manifestSha256);
  for (const [filename, digest] of Object.entries(expected.retainedAssets)) {
    requireHash(snapshot, filename, digest);
  }
  const manifest = snapshot.manifest;
  if (
    manifest?.authoritative !== true ||
    manifest?.mode !== 'release' ||
    manifest?.current !== expected.version
  ) {
    fail('LIVE_MANIFEST_MISMATCH', 'manifest does not identify the planned release');
  }
  const current = manifest.artifacts?.[`v${expected.version}`];
  if (
    current?.filename !== expected.exactFilename ||
    current?.sha256 !== expected.widgetSha256 ||
    (manifest.schema === 'bugdrop.versions-manifest/v2' && current.version !== expected.version)
  ) {
    fail('LIVE_MANIFEST_MISMATCH', 'manifest current artifact is inconsistent');
  }
  const [major, minor] = expected.version.split('.');
  const expectedVersions = {
    [`v${major}`]: `widget.v${major}.js`,
    [`v${major}.${minor}`]: `widget.v${major}.${minor}.js`,
    [`v${expected.version}`]: expected.exactFilename,
  };
  for (const [key, filename] of Object.entries(expectedVersions)) {
    if (manifest.versions?.[key] !== filename) {
      fail('LIVE_MANIFEST_MISMATCH', `manifest version alias ${key} is inconsistent`);
    }
  }
  for (const [filename, digest] of Object.entries(expected.retainedAssets)) {
    const version = filename.slice('widget.v'.length, -'.js'.length);
    const retained = manifest.artifacts?.[`v${version}`];
    if (
      retained?.filename !== filename ||
      retained?.sha256 !== digest ||
      (manifest.schema === 'bugdrop.versions-manifest/v2' && retained.version !== version)
    ) {
      fail('LIVE_MANIFEST_MISMATCH', `manifest retained artifact ${filename} is inconsistent`);
    }
    if (manifest.versions?.[`v${version}`] !== filename) {
      fail('LIVE_MANIFEST_MISMATCH', `manifest retained version v${version} is inconsistent`);
    }
  }
  return {
    origin: expected.origin,
    status: 'verified',
    targetSha: expected.targetSha,
    version: expected.version,
    widgetSha256: expected.widgetSha256,
  };
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function fetchOk(url, fetchImpl, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(url, { redirect: 'error', signal });
  } catch (error) {
    if (signal.aborted) fail('LIVE_FETCH_TIMEOUT', `${url} exceeded ${timeoutMs}ms`);
    throw error;
  }
  if (!response.ok) fail('LIVE_FETCH_FAILED', `${url} returned ${response.status}`);
  return response;
}
async function readBoundedBytes(response, url, maxBytes, budget) {
  const remaining = MAX_SNAPSHOT_BYTES - budget.used;
  const allowed = Math.min(maxBytes, remaining);
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    if (!/^(0|[1-9]\d*)$/.test(declared) || !Number.isSafeInteger(Number(declared))) {
      fail('LIVE_FETCH_FAILED', `${url} returned an invalid Content-Length`);
    }
    if (Number(declared) > allowed) {
      fail('LIVE_FETCH_TOO_LARGE', `${url} exceeds its live verification byte bound`);
    }
  }
  if (!response.body) fail('LIVE_FETCH_FAILED', `${url} returned no response body`);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > allowed) {
      await reader.cancel();
      fail('LIVE_FETCH_TOO_LARGE', `${url} exceeds its live verification byte bound`);
    }
    chunks.push(Buffer.from(value));
  }
  budget.used += total;
  return Buffer.concat(chunks, total);
}
async function collectSnapshot(
  origin,
  filenames,
  fetchImpl,
  timeoutMs,
  manifestErrorCode,
  manifestFilenames = () => [],
  totalTimeoutMs = null
) {
  const budget = { used: 0 };
  const deadline = totalTimeoutMs === null ? null : Date.now() + totalTimeoutMs;
  const requestTimeout = () => {
    if (deadline === null) return timeoutMs;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      fail('LIVE_FETCH_TIMEOUT', `${origin} snapshot exceeded ${totalTimeoutMs}ms`);
    }
    return Math.min(timeoutMs, remaining);
  };
  const healthUrl = `${origin}/api/health`;
  const healthBytes = await readBoundedBytes(
    await fetchOk(healthUrl, fetchImpl, requestTimeout()),
    healthUrl,
    MAX_HEALTH_BYTES,
    budget
  );
  let health;
  try {
    health = JSON.parse(healthBytes.toString('utf8'));
  } catch {
    fail('LIVE_OBSERVATION_FAILED', 'health response is not valid JSON');
  }
  const assetHashes = {};
  let manifest;
  const queue = [...new Set(filenames)];
  const seen = new Set(queue);
  for (let index = 0; index < queue.length; index += 1) {
    const filename = queue[index];
    const url = `${origin}/${filename}`;
    const response = await fetchOk(url, fetchImpl, requestTimeout());
    const payload = await readBoundedBytes(
      response,
      url,
      filename === 'versions.json' ? MAX_MANIFEST_BYTES : MAX_WIDGET_BYTES,
      budget
    );
    assetHashes[filename] = sha256(payload);
    if (filename === 'versions.json') {
      try {
        manifest = JSON.parse(payload.toString('utf8'));
      } catch {
        fail(manifestErrorCode, 'versions.json is not valid JSON');
      }
      for (const additional of manifestFilenames(manifest)) {
        if (!seen.has(additional)) {
          seen.add(additional);
          queue.push(additional);
        }
      }
    }
  }
  return { assetHashes, health, manifest };
}

function baselineManifestFilenames(manifest) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    manifest.latest !== 'widget.js' ||
    !manifest.versions ||
    typeof manifest.versions !== 'object' ||
    Array.isArray(manifest.versions)
  ) {
    fail('LIVE_OBSERVATION_FAILED', 'baseline manifest structure is invalid');
  }
  const current = match(
    manifest.current,
    VERSION_PATTERN,
    'baseline current version',
    'LIVE_OBSERVATION_FAILED'
  );
  const filenames = Object.values(manifest.versions);
  if (filenames.length === 0) {
    fail('LIVE_OBSERVATION_FAILED', 'baseline manifest asset list is empty');
  }
  filenames.forEach(filename =>
    match(filename, ASSET_PATTERN, 'baseline asset filename', 'LIVE_OBSERVATION_FAILED')
  );
  if (manifest.versions[`v${current}`] !== `widget.v${current}.js`) {
    fail('LIVE_OBSERVATION_FAILED', 'baseline exact asset is inconsistent');
  }
  return ['widget.js', ...filenames];
}
async function collectLiveSnapshot(expectedInput, fetchImpl = fetch, timeoutMs = 10000) {
  const expected = normalizeExpected(expectedInput);
  return collectSnapshot(
    expected.origin,
    [
      ...expected.aliasFilenames,
      expected.exactFilename,
      ...Object.keys(expected.retainedAssets),
      'versions.json',
    ],
    fetchImpl,
    timeoutMs,
    'LIVE_MANIFEST_MISMATCH'
  );
}
export async function pollLiveVerification({
  expected,
  snapshotProvider,
  maxAttempts = 30,
  intervalMs = 5000,
  requestTimeoutMs = 10000,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
}) {
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    fail('INVALID_INPUT', 'maxAttempts must be between 1 and 100');
  }
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60000) {
    fail('INVALID_INPUT', 'requestTimeoutMs must be between 1 and 60000');
  }
  const normalizedExpected = normalizeExpected(expected);
  const provider =
    snapshotProvider ?? (() => collectLiveSnapshot(normalizedExpected, fetch, requestTimeoutMs));
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return verifyLiveSnapshot(normalizedExpected, await provider(attempt));
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await sleep(intervalMs);
    }
  }
  fail('LIVE_VERIFICATION_TIMEOUT', `live identity did not match after ${maxAttempts} attempts`, {
    lastCode: lastError?.code ?? 'UNKNOWN',
    lastMessage: lastError instanceof Error ? lastError.message : String(lastError),
  });
}
function observeSnapshotForEnvironment(origin, snapshot, expectedEnvironment) {
  normalizeOrigin(origin);
  if (snapshot?.health?.status !== 'ok' || typeof snapshot.health.environment !== 'string') {
    fail('LIVE_OBSERVATION_FAILED', 'health observation is incomplete');
  }
  if (snapshot.health.environment !== expectedEnvironment) {
    fail(
      'LIVE_ENVIRONMENT_MISMATCH',
      `expected ${expectedEnvironment}, observed ${snapshot.health.environment}`
    );
  }
  match(snapshot.health.buildSha, SHA_PATTERN, 'observed buildSha', 'LIVE_BUILD_SHA_MISMATCH');
  const currentVersion = snapshot.manifest?.current;
  if (typeof currentVersion !== 'string' || !currentVersion) {
    fail('LIVE_OBSERVATION_FAILED', 'manifest current identity is missing');
  }
  return {
    buildSha: snapshot.health.buildSha,
    currentVersion,
    environment: snapshot.health.environment,
    manifestSha256: observedHash(snapshot, 'versions.json'),
    origin,
    status: 'observed',
    verifiedAgainstPlan: false,
    widgetSha256: observedHash(snapshot, 'widget.js'),
  };
}
export function observeLiveSnapshot(origin, snapshot) {
  return observeSnapshotForEnvironment(origin, snapshot, 'production');
}
export function observePreviewSnapshot(origin, snapshot) {
  return observeSnapshotForEnvironment(origin, snapshot, 'preview');
}
export function observeBaselineSnapshot(origin, snapshot) {
  normalizeOrigin(origin);
  if (snapshot?.health?.status !== 'ok' || typeof snapshot.health.environment !== 'string') {
    fail('LIVE_OBSERVATION_FAILED', 'health observation is incomplete');
  }
  const environment = snapshot.health.environment;
  const buildSha = snapshot.health.buildSha;
  if (environment === 'production') {
    match(buildSha, SHA_PATTERN, 'observed buildSha', 'LIVE_BUILD_SHA_MISMATCH');
  } else if (environment !== 'development' || (buildSha !== undefined && buildSha !== null)) {
    fail('LIVE_ENVIRONMENT_MISMATCH', 'baseline identity is neither bootstrap nor production');
  }
  const currentVersion = snapshot.manifest?.current;
  if (typeof currentVersion !== 'string' || !currentVersion) {
    fail('LIVE_OBSERVATION_FAILED', 'manifest current identity is missing');
  }
  const assetHashes = Object.fromEntries(
    Object.entries(normalizeHashMap(snapshot.assetHashes, 'baseline asset hashes')).sort(
      ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)
    )
  );
  return {
    ...(typeof buildSha === 'string' ? { buildSha } : {}),
    assetHashes,
    currentVersion,
    environment,
    manifestSha256: observedHash(snapshot, 'versions.json'),
    origin,
    status: 'observed',
    verifiedAgainstPlan: false,
    widgetSha256: observedHash(snapshot, 'widget.js'),
  };
}
async function collectObservation(origin, fetchImpl = fetch) {
  normalizeOrigin(origin);
  return collectSnapshot(
    origin,
    ['widget.js', 'versions.json'],
    fetchImpl,
    10000,
    'LIVE_OBSERVATION_FAILED'
  );
}

export async function collectRecoveryIdentity(origin, fetchImpl = fetch, timeoutMs = 10000) {
  normalizeOrigin(origin);
  const snapshot = await collectSnapshot(
    origin,
    ['widget.js', 'versions.json'],
    fetchImpl,
    timeoutMs,
    'LIVE_OBSERVATION_FAILED'
  );
  const observed = observeLiveSnapshot(origin, snapshot);
  return {
    ...observed,
    sourceIdentity: canonicalHash({
      buildSha: observed.buildSha ?? null,
      currentVersion: observed.currentVersion,
      environment: observed.environment,
    }),
    assetIdentity: canonicalHash({
      manifestSha256: observed.manifestSha256,
      widgetSha256: observed.widgetSha256,
    }),
  };
}
export async function collectBaselineIdentity(
  origin,
  fetchImpl = fetch,
  timeoutMs = 10000,
  totalTimeoutMs = MAX_BASELINE_OBSERVATION_MS
) {
  normalizeOrigin(origin);
  const snapshot = await collectSnapshot(
    origin,
    ['widget.js', 'versions.json'],
    fetchImpl,
    timeoutMs,
    'LIVE_OBSERVATION_FAILED',
    baselineManifestFilenames,
    totalTimeoutMs
  );
  const observed = observeBaselineSnapshot(origin, snapshot);
  return {
    ...observed,
    sourceIdentity: canonicalHash({
      buildSha: observed.buildSha ?? null,
      currentVersion: observed.currentVersion,
      environment: observed.environment,
    }),
    assetIdentity: canonicalHash({ assetHashes: observed.assetHashes }),
  };
}
function expectedFromEnvironment() {
  let aliases;
  let retained;
  try {
    aliases = JSON.parse(process.env.EXPECTED_ALIAS_FILENAMES ?? '[]');
    retained = JSON.parse(process.env.EXPECTED_RETAINED_ASSETS ?? '{}');
  } catch {
    fail('INVALID_INPUT', 'expected alias/retained environment values must be JSON');
  }
  return {
    aliasFilenames: aliases,
    exactFilename: process.env.EXPECTED_EXACT_FILENAME,
    manifestSha256: process.env.EXPECTED_MANIFEST_SHA256,
    origin: process.env.EXPECTED_WIDGET_ORIGIN,
    retainedAssets: retained,
    targetSha: process.env.EXPECTED_TARGET_SHA,
    version: process.env.EXPECTED_VERSION,
    widgetSha256: process.env.EXPECTED_WIDGET_SHA256,
  };
}
async function main() {
  const mode = process.argv[2];
  if (mode === 'verify') {
    process.stdout.write(
      `${JSON.stringify(await pollLiveVerification({ expected: expectedFromEnvironment() }))}\n`
    );
    return;
  }
  if (mode === 'observe') {
    const origin = normalizeOrigin(process.env.EXPECTED_WIDGET_ORIGIN);
    process.stdout.write(
      `${JSON.stringify(observeLiveSnapshot(origin, await collectObservation(origin)))}\n`
    );
    return;
  }
  if (mode === 'preview-observe') {
    const origin = normalizeOrigin(process.env.EXPECTED_WIDGET_ORIGIN);
    process.stdout.write(
      `${JSON.stringify(observePreviewSnapshot(origin, await collectObservation(origin)))}\n`
    );
    return;
  }
  if (mode === 'recovery-observe') {
    const origin = normalizeOrigin(process.env.EXPECTED_WIDGET_ORIGIN);
    process.stdout.write(`${JSON.stringify(await collectRecoveryIdentity(origin))}\n`);
    return;
  }
  fail('INVALID_INPUT', 'usage: verify-live.mjs verify|observe|preview-observe|recovery-observe');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
