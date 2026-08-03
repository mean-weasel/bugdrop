import { createHash } from 'node:crypto';

import { canonicalHash, canonicalize } from './canonical-json.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:[-+][0-9A-Za-z.-]+)?$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export class ProductionStateError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'ProductionStateError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ProductionStateError(code, message, details);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function match(value, pattern, field, code = 'INVALID_INPUT') {
  if (!pattern.test(value ?? '')) fail(code, `${field} is invalid`);
  return value;
}

function bytes(value, field) {
  if (!Buffer.isBuffer(value)) fail('INVALID_INPUT', `${field} must be a Buffer`);
  return value;
}

function safeRelativePath(value, field) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    fail('UNSAFE_CANDIDATE_PATH', `${field} must be a normalized candidate-relative path`);
  }
  return value;
}

function parseControllerToolchain(lockBytes) {
  let lock;
  try {
    lock = JSON.parse(bytes(lockBytes, 'controllerLockBytes').toString('utf8'));
  } catch {
    fail('INVALID_CONTROLLER_LOCK', 'controller lockfile is not valid JSON');
  }
  const wrangler = lock?.packages?.['node_modules/wrangler']?.version;
  const esbuild = lock?.packages?.['node_modules/esbuild']?.version;
  match(wrangler, VERSION_PATTERN, 'locked Wrangler version', 'INVALID_CONTROLLER_LOCK');
  match(esbuild, VERSION_PATTERN, 'locked esbuild version', 'INVALID_CONTROLLER_LOCK');
  return { esbuild, wrangler };
}

function hashCandidateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    fail('INVALID_INPUT', 'candidateFiles must be a non-empty complete file list');
  }
  const entries = files.map(file => [
    safeRelativePath(file?.path, 'candidate file path'),
    sha256(bytes(file?.bytes, `candidate file ${file?.path ?? '<unknown>'}`)),
  ]);
  const paths = entries.map(([path]) => path);
  if (new Set(paths).size !== paths.length)
    fail('DUPLICATE_CANDIDATE_FILE', 'candidate file paths repeat');
  return { identity: canonicalHash(Object.fromEntries(entries)), paths };
}

export function createWorkerProvenance(input) {
  if (input?.environment !== 'production') {
    fail('INVALID_ENVIRONMENT', 'Worker release provenance requires production');
  }
  const targetSha = match(input.targetSha, SHA_PATTERN, 'targetSha');
  const releasePlanIdentity = match(
    input.releasePlanIdentity,
    IDENTITY_PATTERN,
    'releasePlanIdentity'
  );
  const entrypoint = safeRelativePath(input.entrypoint, 'entrypoint');
  const moduleRoot = safeRelativePath(input.moduleRoot, 'moduleRoot');
  if (moduleRoot !== 'node_modules') {
    fail('UNSAFE_MODULE_ROOT', 'moduleRoot must select candidate node_modules');
  }
  const toolchain = parseControllerToolchain(input.controllerLockBytes);
  const candidateTree = hashCandidateFiles(input.candidateFiles);
  if (!candidateTree.paths.includes(entrypoint)) {
    fail('ENTRYPOINT_NOT_IN_CANDIDATE', 'entrypoint must exist in the declared candidate tree');
  }
  const content = {
    candidateLockDigest: sha256(bytes(input.candidateLockBytes, 'candidateLockBytes')),
    candidateTreeIdentity: candidateTree.identity,
    controllerConfigDigest: sha256(bytes(input.controllerConfigBytes, 'controllerConfigBytes')),
    controllerLockDigest: sha256(input.controllerLockBytes),
    deploymentVariables: { BUILD_SHA: targetSha, ENVIRONMENT: 'production' },
    entrypoint,
    environment: 'production',
    moduleRoot,
    releasePlanIdentity,
    targetSha,
    toolchain,
    workerIntegrityClaim: 'source-lock-tool-config-live-sha',
  };
  return { ...content, stagingIdentity: canonicalHash(content) };
}

function normalizeHashMap(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('AMBIGUOUS_PRODUCTION_STATE', `${field} must be an object`);
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([name, digest]) => [
        safeRelativePath(name, `${field} name`),
        match(digest, DIGEST_PATTERN, `${field}.${name}`, 'AMBIGUOUS_PRODUCTION_STATE'),
      ])
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  );
}

function normalizeAssets(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('AMBIGUOUS_PRODUCTION_STATE', 'asset observation is missing');
  }
  return {
    aliases: normalizeHashMap(value.aliases, 'aliases'),
    manifestSha256: match(
      value.manifestSha256,
      DIGEST_PATTERN,
      'manifestSha256',
      'AMBIGUOUS_PRODUCTION_STATE'
    ),
    retained: normalizeHashMap(value.retained, 'retained'),
    widgetSha256: match(
      value.widgetSha256,
      DIGEST_PATTERN,
      'widgetSha256',
      'AMBIGUOUS_PRODUCTION_STATE'
    ),
  };
}

export function normalizeProductionState(input) {
  if (input?.apiComplete !== true || !Array.isArray(input.activeDeployments)) {
    fail('AMBIGUOUS_PRODUCTION_STATE', 'Cloudflare deployment state is incomplete');
  }
  const active = input.activeDeployments.filter(item => item?.trafficPercent === 100);
  if (active.length !== 1 || input.activeDeployments.length !== 1) {
    fail('AMBIGUOUS_PRODUCTION_STATE', 'exactly one fully active deployment is required');
  }
  const deployment = active[0];
  const cloudflare = {
    deploymentId: match(
      deployment.deploymentId,
      SAFE_ID_PATTERN,
      'deploymentId',
      'AMBIGUOUS_PRODUCTION_STATE'
    ),
    versionId: match(
      deployment.versionId,
      SAFE_ID_PATTERN,
      'versionId',
      'AMBIGUOUS_PRODUCTION_STATE'
    ),
  };
  if (input.health?.status !== 'ok' || typeof input.health.environment !== 'string') {
    fail('AMBIGUOUS_PRODUCTION_STATE', 'live health is missing or unhealthy');
  }
  const buildSha = input.health.buildSha?.trim();
  let kind;
  if (input.health.environment === 'production') {
    match(buildSha, SHA_PATTERN, 'health.buildSha', 'AMBIGUOUS_PRODUCTION_STATE');
    kind = 'identified';
  } else if (input.health.environment === 'development' && !buildSha) {
    kind = 'bootstrap';
  } else {
    fail('AMBIGUOUS_PRODUCTION_STATE', 'health identity is neither bootstrap nor production');
  }
  const content = {
    assets: normalizeAssets(input.assets),
    cloudflare,
    health: {
      environment: input.health.environment,
      status: 'ok',
      ...(buildSha ? { buildSha } : {}),
    },
    kind,
    priorTag: match(input.priorTag, TAG_PATTERN, 'priorTag', 'AMBIGUOUS_PRODUCTION_STATE'),
  };
  return { ...content, baselineIdentity: canonicalHash(content) };
}

export function inspectProductionState(input) {
  try {
    return { status: 'normalized', baseline: normalizeProductionState(input) };
  } catch (error) {
    if (!(error instanceof ProductionStateError)) throw error;
    return { status: 'ambiguous', code: error.code, reason: error.message };
  }
}

function changedFields(expected, observed, prefix = '') {
  if (expected === undefined || observed === undefined) return [prefix || '<root>'];
  if (canonicalize(expected) === canonicalize(observed)) return [];
  if (
    expected === null ||
    observed === null ||
    typeof expected !== 'object' ||
    typeof observed !== 'object' ||
    Array.isArray(expected) ||
    Array.isArray(observed)
  ) {
    return [prefix || '<root>'];
  }
  return [...new Set([...Object.keys(expected), ...Object.keys(observed)])].flatMap(key =>
    changedFields(expected[key], observed[key], prefix ? `${prefix}.${key}` : key)
  );
}

export function verifyProductionBaseline(expected, observed) {
  const fields = changedFields(expected, observed).filter(field => field !== 'baselineIdentity');
  return fields.length === 0 ? { status: 'verified' } : { status: 'mismatch', fields };
}

export function classifyDeploymentObservation({ commandStatus, before, after, candidate }) {
  if (!['succeeded', 'failed', 'unknown'].includes(commandStatus)) {
    fail('INVALID_INPUT', 'commandStatus is invalid');
  }
  if (!after) return { status: 'ambiguous-critical', reason: 'inspection-unavailable' };
  if (after.baselineIdentity === candidate?.baselineIdentity) return { status: 'candidate-active' };
  if (after.baselineIdentity === before?.baselineIdentity) return { status: 'unchanged' };
  return { status: 'ambiguous-critical', reason: 'unexpected-active-state' };
}

export function createRecoveryEvidence(input) {
  const evidence = {
    automaticCommandAuthorized: false,
    baselineIdentity: match(input.baseline?.baselineIdentity, IDENTITY_PATTERN, 'baselineIdentity'),
    intendedTargetSha: match(input.intendedTargetSha, SHA_PATTERN, 'intendedTargetSha'),
    observation: input.observation,
    releasePlanIdentity: match(input.releasePlanIdentity, IDENTITY_PATTERN, 'releasePlanIdentity'),
  };
  return { ...evidence, evidenceIdentity: canonicalHash(evidence) };
}
