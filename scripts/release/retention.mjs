import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { canonicalize, compareUtf8 } from './canonical-json.mjs';

const RETENTION_REQUEST_SCHEMA = 'bugdrop.retention-request/v1';
const RETENTION_INPUT_SCHEMA = 'bugdrop.retention-input/v1';
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const IDENTITY = /^sha256:[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9]\d*)$/;
const MAX_ASSET = 16 * 1024 * 1024;
const MAX_TOTAL = 512 * 1024 * 1024;

class RetentionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.name = 'RetentionError';
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new RetentionError(code, message);
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function compareVersions(left, right) {
  const a = VERSION.exec(left ?? '');
  const b = VERSION.exec(right ?? '');
  if (!a || !b) fail('INVALID_VERSION', 'versions must be stable MAJOR.MINOR.PATCH');
  for (let i = 1; i < 4; i += 1) {
    const x = Number(a[i]);
    const y = Number(b[i]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y))
      fail('INVALID_VERSION', 'version is too large');
    if (x !== y) return x - y;
  }
  return 0;
}

function validateRecord(record) {
  const keys = [
    'version',
    'tag',
    'releaseId',
    'targetSha',
    'publishedAt',
    'sourcePlanIdentity',
    'sourceContentIdentity',
    'asset',
  ];
  if (
    record?.constructor !== Object ||
    Object.keys(record).sort(compareUtf8).join() !== keys.sort(compareUtf8).join()
  )
    fail('INVALID_RETENTION_RECORD', 'record fields are not exact');
  if (
    !VERSION.test(record.version) ||
    record.tag !== `v${record.version}` ||
    !DECIMAL.test(record.releaseId) ||
    !SHA.test(record.targetSha)
  )
    fail('INVALID_RETENTION_RECORD', `invalid authority for v${record.version}`);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.publishedAt) ||
    !IDENTITY.test(record.sourcePlanIdentity) ||
    !IDENTITY.test(record.sourceContentIdentity)
  )
    fail('INVALID_RETENTION_RECORD', `invalid identities for v${record.version}`);
  const asset = record.asset;
  const assetKeys = ['assetId', 'name', 'apiPath', 'downloadUrl', 'sha256'];
  if (
    asset?.constructor !== Object ||
    Object.keys(asset).sort(compareUtf8).join() !== assetKeys.sort(compareUtf8).join()
  )
    fail('INVALID_RETENTION_RECORD', 'asset fields are not exact');
  if (
    !DECIMAL.test(asset.assetId) ||
    asset.name !== `widget.v${record.version}.js` ||
    !asset.apiPath.startsWith('/repos/') ||
    !asset.apiPath.endsWith(`/releases/assets/${asset.assetId}`) ||
    !asset.downloadUrl.startsWith('https://github.com/') ||
    !DIGEST.test(asset.sha256)
  )
    fail('INVALID_RETENTION_RECORD', `invalid asset for v${record.version}`);
  return record;
}

export function validateRetentionRequest(value, { candidateVersion } = {}) {
  const requestKeys = ['schema', 'mode', 'cutoverVersion', 'expectedRetainedVersions', 'releases'];
  if (
    value?.constructor !== Object ||
    Object.keys(value).sort(compareUtf8).join() !== requestKeys.sort(compareUtf8).join()
  )
    fail('INVALID_RETENTION_REQUEST', 'retention request fields are not exact');
  if (
    value?.schema !== RETENTION_REQUEST_SCHEMA ||
    !['disabled', 'bootstrap', 'continue'].includes(value.mode)
  )
    fail('INVALID_RETENTION_REQUEST', 'schema or mode is invalid');
  const versions = value.expectedRetainedVersions;
  if (!Array.isArray(versions) || !Array.isArray(value.releases))
    fail('INVALID_RETENTION_REQUEST', 'retained collections are required');
  if (value.mode === 'disabled') {
    if (value.cutoverVersion !== null || versions.length || value.releases.length)
      fail('INVALID_RETENTION_REQUEST', 'disabled retention must be empty');
    return value;
  }
  if (!VERSION.test(value.cutoverVersion ?? ''))
    fail('INVALID_RETENTION_REQUEST', 'active cutover is invalid');
  if (
    value.mode === 'bootstrap' &&
    ((candidateVersion !== undefined && value.cutoverVersion !== candidateVersion) ||
      versions.length)
  )
    fail('INVALID_RETENTION_REQUEST', 'bootstrap must begin at the candidate with no history');
  if (
    new Set(versions).size !== versions.length ||
    versions.some((v, i) => i && compareVersions(versions[i - 1], v) >= 0)
  )
    fail('INVALID_RETENTION_REQUEST', 'versions must be unique numeric SemVer order');
  if (candidateVersion && versions.some(v => compareVersions(v, candidateVersion) >= 0))
    fail('INVALID_RETENTION_REQUEST', 'retained version is not prior');
  value.releases.forEach(validateRecord);
  if (value.releases.map(r => r.version).join() !== versions.join())
    fail('INVALID_RETENTION_REQUEST', 'release chain does not equal expected set');
  return value;
}

export function deriveRetentionRequest({
  candidateVersion,
  retentionBootstrap = false,
  releases = [],
}) {
  const stable = releases
    .filter(r => r.published && !r.draft && !r.prerelease)
    .sort((a, b) => compareVersions(a.version, b.version));
  const active = stable.filter(
    r => r.retention?.mode === 'bootstrap' || r.retention?.mode === 'continue'
  );
  if (!active.length)
    return validateRetentionRequest(
      {
        schema: RETENTION_REQUEST_SCHEMA,
        mode: retentionBootstrap ? 'bootstrap' : 'disabled',
        cutoverVersion: retentionBootstrap ? candidateVersion : null,
        expectedRetainedVersions: [],
        releases: [],
      },
      { candidateVersion }
    );
  if (retentionBootstrap) fail('RETENTION_ALREADY_ACTIVE', 'bootstrap cannot be selected twice');
  const boundaries = new Set(active.map(r => r.retention.cutoverVersion));
  if (boundaries.size !== 1)
    fail('RETENTION_BOUNDARY_CONFLICT', 'published Releases disagree on cutover');
  const cutoverVersion = [...boundaries][0];
  const supported = stable.filter(
    r =>
      compareVersions(r.version, cutoverVersion) >= 0 &&
      compareVersions(r.version, candidateVersion) < 0
  );
  if (supported.some(r => !active.includes(r)))
    fail('RETENTION_HISTORY_INCOMPLETE', 'post-boundary Release is not retention-capable');
  supported.forEach((release, index) => {
    const expectedPrior = supported.slice(0, index).map(item => item.version);
    const authenticatedPrefix = supported
      .slice(0, index)
      .map(item => validateRecord(item.retentionRecord));
    if (
      release.retention.cutoverVersion !== cutoverVersion ||
      release.retention.mode !== (index === 0 ? 'bootstrap' : 'continue') ||
      release.retention.expectedRetainedVersions.join() !== expectedPrior.join() ||
      !Array.isArray(release.retention.releases) ||
      canonicalize(release.retention.releases) !== canonicalize(authenticatedPrefix)
    ) {
      fail(
        'RETENTION_CHAIN_MISMATCH',
        `${release.version} does not declare the exact preceding set`
      );
    }
  });
  const records = supported.map(r => validateRecord(r.retentionRecord));
  return validateRetentionRequest(
    {
      schema: RETENTION_REQUEST_SCHEMA,
      mode: 'continue',
      cutoverVersion,
      expectedRetainedVersions: records.map(r => r.version),
      releases: records,
    },
    { candidateVersion }
  );
}

function confined(root, relativePath) {
  if (relativePath !== basename(relativePath)) fail('UNSAFE_RETENTION_PATH', relativePath);
  const target = resolve(root, relativePath);
  if (!target.startsWith(`${resolve(root)}/`)) fail('UNSAFE_RETENTION_PATH', relativePath);
  return target;
}

export async function writeRetentionInput({ root, requestIdentity, retention, assets }) {
  validateRetentionRequest(retention);
  await mkdir(root, { recursive: true });
  let total = 0;
  const retainedReleases = [];
  for (const record of retention.releases) {
    const bytes = assets[record.version];
    if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_ASSET)
      fail('RETENTION_SIZE_LIMIT', `invalid size for v${record.version}`);
    total += bytes.length;
    if (total > MAX_TOTAL) fail('RETENTION_SIZE_LIMIT', 'cumulative retained bytes exceed limit');
    if (hash(bytes) !== record.asset.sha256) fail('RETAINED_HASH_MISMATCH', `v${record.version}`);
    const assetPath = record.asset.name;
    await writeFile(confined(root, assetPath), bytes, { flag: 'wx' });
    retainedReleases.push({
      version: record.version,
      targetSha: record.targetSha,
      publishedAt: record.publishedAt,
      archiveUrl: record.asset.downloadUrl,
      sha256: record.asset.sha256,
      assetPath,
    });
  }
  const plan = { schema: RETENTION_INPUT_SCHEMA, requestIdentity, retention, retainedReleases };
  await writeFile(join(root, 'retention-plan.json'), `${canonicalize(plan)}\n`, { flag: 'wx' });
  return plan;
}

export async function loadRetentionInput(path, requestIdentity, expectedRetention) {
  const root = resolve(path, '..');
  const planDetails = await lstat(path);
  if (!planDetails.isFile() || planDetails.isSymbolicLink() || planDetails.size > 1024 * 1024) {
    fail('RETENTION_INPUT_MISMATCH', 'retention-plan.json is not a bounded regular file');
  }
  const inputBytes = await readFile(path);
  let input;
  try {
    input = JSON.parse(inputBytes.toString('utf8'));
  } catch {
    fail('RETENTION_INPUT_MISMATCH', 'transport plan is not JSON');
  }
  if (!inputBytes.equals(Buffer.from(`${canonicalize(input)}\n`))) {
    fail('RETENTION_INPUT_MISMATCH', 'transport plan is not canonical JSON');
  }
  const inputKeys = ['schema', 'requestIdentity', 'retention', 'retainedReleases'];
  if (
    input?.constructor !== Object ||
    Object.keys(input).sort(compareUtf8).join() !== inputKeys.sort(compareUtf8).join()
  ) {
    fail('RETENTION_INPUT_MISMATCH', 'transport plan fields are not exact');
  }
  if (input.schema !== RETENTION_INPUT_SCHEMA || input.requestIdentity !== requestIdentity)
    fail('RETENTION_INPUT_MISMATCH', 'transport identity differs from request');
  validateRetentionRequest(input.retention);
  if (expectedRetention && canonicalize(input.retention) !== canonicalize(expectedRetention)) {
    fail('RETENTION_INPUT_MISMATCH', 'transport retention differs from the approved request');
  }
  if (
    !Array.isArray(input.retainedReleases) ||
    input.retainedReleases.length !== input.retention.releases.length
  ) {
    fail('RETENTION_INPUT_MISMATCH', 'transport records differ from the approved request');
  }
  const retainedReleases = [];
  let totalBytes = 0;
  for (let index = 0; index < input.retainedReleases.length; index += 1) {
    const item = input.retainedReleases[index];
    const authority = input.retention.releases[index];
    const keys = ['version', 'targetSha', 'publishedAt', 'archiveUrl', 'sha256', 'assetPath'];
    if (
      item?.constructor !== Object ||
      Object.keys(item).sort(compareUtf8).join() !== keys.sort(compareUtf8).join() ||
      !authority ||
      item.version !== authority.version ||
      item.targetSha !== authority.targetSha ||
      item.publishedAt !== authority.publishedAt ||
      item.archiveUrl !== authority.asset.downloadUrl ||
      item.sha256 !== authority.asset.sha256 ||
      item.assetPath !== authority.asset.name
    ) {
      fail('RETENTION_INPUT_MISMATCH', 'transport metadata is not an exact request projection');
    }
    const assetPath = confined(root, item.assetPath);
    const details = await lstat(assetPath);
    if (
      !details.isFile() ||
      details.isSymbolicLink() ||
      details.size < 1 ||
      details.size > MAX_ASSET
    ) {
      fail('RETENTION_SIZE_LIMIT', `invalid retained file for v${item.version}`);
    }
    totalBytes += details.size;
    if (totalBytes > MAX_TOTAL)
      fail('RETENTION_SIZE_LIMIT', 'cumulative retained bytes exceed limit');
    const bytes = await readFile(assetPath);
    if (hash(bytes) !== item.sha256) fail('RETAINED_HASH_MISMATCH', `v${item.version}`);
    retainedReleases.push({ ...item, assetPath });
  }
  const expectedFiles = [
    'retention-plan.json',
    ...input.retention.releases.map(record => record.asset.name),
  ].sort(compareUtf8);
  const actualFiles = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const details = await lstat(join(root, entry.name));
    if (!details.isFile() || details.isSymbolicLink()) {
      fail('RETENTION_INPUT_MISMATCH', `unexpected retention input entry ${entry.name}`);
    }
    actualFiles.push(entry.name);
  }
  if (canonicalize(actualFiles.sort(compareUtf8)) !== canonicalize(expectedFiles)) {
    fail('RETENTION_INPUT_MISMATCH', 'retention input file set is not exact');
  }
  return { ...input.retention, requestIdentity: input.requestIdentity, retainedReleases };
}
