#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalHash, canonicalize, normalizeCanonicalValue } from './canonical-json.mjs';

export const RELEASE_PROTOCOL = 'release-plan/v1';
export const REQUEST_SCHEMA = 'bugdrop.release-request/v1';
export const CONTENT_SCHEMA = 'bugdrop.release-content/v1';
export const AUDIT_SCHEMA = 'bugdrop.release-audit/v1';
export const MARKER_SCHEMA = 'bugdrop.publication-marker/v1';
export const INVENTORY_SCHEMA = 'bugdrop.release-inventory/v1';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export class ReleasePlanError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'ReleasePlanError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ReleasePlanError(code, message, details);
}

function fullSha(value, field) {
  if (!SHA_PATTERN.test(value ?? '')) fail('INVALID_SHA', `${field} must be a full lowercase SHA`);
  return value;
}

function digest(value, field) {
  if (!/^[0-9a-f]{64}$/.test(value ?? '')) fail('INVALID_DIGEST', `${field} must be SHA-256`);
  return value;
}

function exactKeys(value, keys, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_SCHEMA', `${field} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalize(actual) !== canonicalize(expected)) {
    fail('INVALID_SCHEMA', `${field} must contain exactly ${expected.join(', ')}`);
  }
}

function text(value, field, { required = false, max = 5000 } = {}) {
  if (typeof value !== 'string') fail('INVALID_INPUT', `${field} must be text`);
  const normalized = normalizeCanonicalValue(value).trim();
  if (required && !normalized) fail('INVALID_INPUT', `${field} is required`);
  if (normalized.length > max) fail('INVALID_INPUT', `${field} exceeds ${max} characters`);
  return normalized;
}

export function normalizeDispatch(input) {
  if (!input || typeof input !== 'object') fail('INVALID_INPUT', 'dispatch must be an object');
  const repository = text(input.repository, 'repository', { required: true });
  const workflowRef = text(input.workflowRef, 'workflowRef', { required: true });
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository))
    fail('INVALID_INPUT', 'repository must be owner/name');
  if (!/^\.github\/workflows\/[^@]+@refs\/heads\/main$/.test(workflowRef)) {
    fail('UNTRUSTED_WORKFLOW_REF', 'workflowRef must select the protected main branch');
  }
  if (!['patch', 'minor', 'major'].includes(input.bump)) {
    fail('INVALID_BUMP', 'bump must be patch, minor, or major');
  }
  if (!['standard', 'emergency'].includes(input.releaseReason)) {
    fail('INVALID_RELEASE_REASON', 'releaseReason must be standard or emergency');
  }
  const rationale = text(input.rationale ?? '', 'rationale', {
    required: input.releaseReason === 'emergency',
    max: 2000,
  });
  if (input.dryRun !== undefined && typeof input.dryRun !== 'boolean') {
    fail('INVALID_INPUT', 'dryRun must be a boolean');
  }
  return {
    repository,
    workflowRef,
    targetSha: fullSha(input.targetSha, 'targetSha'),
    controllerSha: fullSha(input.controllerSha, 'controllerSha'),
    bump: input.bump,
    releaseReason: input.releaseReason,
    rationale,
    operatorNotes: text(input.operatorNotes ?? '', 'operatorNotes', { max: 5000 }),
    dryRun: input.dryRun ?? true,
  };
}

export function validateSourceContext(dispatch, facts) {
  const normalized = normalizeDispatch(dispatch);
  if (facts?.candidateRef !== 'refs/heads/main') {
    fail('UNTRUSTED_CANDIDATE_REF', 'candidate must be selected from remote main');
  }
  if (facts.targetReachableFromMain !== true) {
    fail('TARGET_NOT_ON_MAIN', 'target is not reachable from remote main');
  }
  if (facts.targetExists !== true) fail('TARGET_NOT_FOUND', 'target commit was not fetched');
  if (facts.previousReleaseAncestor !== true) {
    fail('FRONTIER_NOT_ANCESTOR', 'previous published Release is not an ancestor of target');
  }
  if (facts.targetStrictlyLater !== true) fail('EMPTY_RELEASE_RANGE', 'target equals the frontier');
  if (facts.laterReleaseContainsTarget !== false) {
    fail('TARGET_ALREADY_CONTAINED', 'a later stable Release contains target');
  }
  if (facts.preflightSuccessful !== true) {
    fail('RELEASE_PREFLIGHT_MISSING', 'required merge-queue or equivalent checks did not pass');
  }
  if (facts.controllerReachableFromMain !== true) {
    fail('CONTROLLER_NOT_ON_MAIN', 'controller is not an authenticated main-history commit');
  }
  return normalized;
}

function semver(tag) {
  const match = TAG_PATTERN.exec(tag ?? '');
  if (!match) fail('INVALID_STABLE_TAG', `${tag ?? '<missing>'} is not a stable SemVer tag`);
  const values = match.slice(1).map(Number);
  if (values.some(value => !Number.isSafeInteger(value))) {
    fail('INVALID_STABLE_TAG', `${tag} exceeds safe SemVer bounds`);
  }
  return values;
}

function semverCompare(left, right) {
  const a = semver(left);
  const b = semver(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function calculateNextTag(previousTag, bump) {
  if (!['patch', 'minor', 'major'].includes(bump)) fail('INVALID_BUMP', `unsupported bump ${bump}`);
  const version = previousTag === null ? [0, 0, 0] : semver(previousTag);
  const index = { major: 0, minor: 1, patch: 2 }[bump];
  version[index] += 1;
  for (let reset = index + 1; reset < 3; reset += 1) version[reset] = 0;
  return `v${version.join('.')}`;
}

export function normalizeGithubState(input) {
  if (
    input?.apiComplete === false ||
    !Array.isArray(input?.refs) ||
    !Array.isArray(input?.releases)
  ) {
    fail('API_STATE_UNCERTAIN', 'tags and Releases must be fetched completely');
  }
  const refs = input.refs.map(ref => ({
    ...ref,
    tag: ref.tag,
    sha: fullSha(ref.sha, `ref ${ref.tag}`),
  }));
  const refTargets = new Map();
  for (const ref of refs) {
    const prior = refTargets.get(ref.tag);
    if (prior && prior !== ref.sha) fail('AMBIGUOUS_TAG_REF', `${ref.tag} resolves to two SHAs`);
    refTargets.set(ref.tag, ref.sha);
  }
  const refByTag = new Map(refs.map(ref => [ref.tag, ref.sha]));
  for (const release of input.releases) {
    if (
      release.published === true &&
      release.draft === false &&
      release.prerelease === false &&
      release.relationToTarget === undefined &&
      typeof release.reachableFromTarget !== 'boolean'
    ) {
      fail('API_STATE_UNCERTAIN', `ancestry for ${release.tag ?? '<unknown>'} is missing`);
    }
  }
  const releases = input.releases.map(release => ({
    ...release,
    resolvedTagSha: refByTag.get(release.tag),
    relationToTarget:
      release.relationToTarget ?? (release.reachableFromTarget ? 'ancestor' : 'descendant'),
  }));
  const stablePublished = releases.filter(
    release => release.published === true && release.draft === false && release.prerelease === false
  );
  for (const release of stablePublished) {
    if (!TAG_PATTERN.test(release.tag) || !SHA_PATTERN.test(release.targetSha)) {
      fail('INVALID_PUBLISHED_RELEASE', 'published stable Release has an invalid tag or target');
    }
    if (refByTag.get(release.tag) !== release.targetSha) {
      fail('DIVERGENT_RELEASE_REF', `${release.tag} does not resolve to its Release target`);
    }
    if (!['ancestor', 'descendant'].includes(release.relationToTarget)) {
      fail('DIVERGENT_RELEASE_HISTORY', `${release.tag} is not in the candidate history`);
    }
  }
  const published = stablePublished.filter(release => release.relationToTarget === 'ancestor');
  const identities = new Map();
  for (const release of stablePublished) {
    const prior = identities.get(release.tag);
    if (prior) fail('AMBIGUOUS_RELEASE', `${release.tag} has multiple published Releases`);
    identities.set(release.tag, release.targetSha);
  }
  const publishedTags = new Set(published.map(release => release.tag));
  const partialMap = new Map();
  for (const ref of refs.filter(ref => TAG_PATTERN.test(ref.tag))) {
    if (!publishedTags.has(ref.tag)) partialMap.set(ref.tag, { ...ref, kind: 'tag-only' });
  }
  for (const release of releases.filter(item => item.draft && TAG_PATTERN.test(item.tag))) {
    partialMap.set(release.tag, { ...release, kind: 'draft' });
  }
  return { refs, releases, published, partials: [...partialMap.values()] };
}

export function publishedFrontier(state) {
  return state.published.reduce(
    (highest, release) =>
      !highest || semverCompare(release.tag, highest.tag) > 0 ? release : highest,
    null
  );
}

function normalizedLabels(labels = []) {
  if (!Array.isArray(labels)) fail('INVALID_INVENTORY', 'labels must be an array');
  return [
    ...new Set(labels.map(label => text(label, 'label', { required: true, max: 100 }))),
  ].sort();
}

export function buildReleaseInventory(input) {
  if (!Array.isArray(input?.pullRequests) || !Array.isArray(input?.commits)) {
    fail('INVALID_INVENTORY', 'complete pull request and commit arrays are required');
  }
  const pullRequests = input.pullRequests
    .map(pr => ({
      number: pr.number,
      title: text(pr.title, 'pull request title', { required: true }),
      url: text(pr.url, 'pull request URL', { required: true }),
      sha: fullSha(pr.sha, `pull request ${pr.number} SHA`),
      labels: normalizedLabels(pr.labels),
    }))
    .sort((left, right) => left.number - right.number);
  if (pullRequests.some(pr => !Number.isSafeInteger(pr.number) || pr.number < 1)) {
    fail('INVALID_INVENTORY', 'pull request numbers must be positive integers');
  }
  const commits = input.commits
    .map(commit => ({
      sha: fullSha(commit.sha, 'commit SHA'),
      subject: text(commit.subject, 'commit subject', { required: true }),
    }))
    .sort((left, right) => (left.sha < right.sha ? -1 : left.sha > right.sha ? 1 : 0));
  if (commits.length === 0) fail('EMPTY_RELEASE_RANGE', 'compare inventory has no commits');
  const changedPaths = [
    ...new Set((input.changedPaths ?? []).map(path => text(path, 'path', { required: true }))),
  ].sort();
  const excludedNewerMainCommits = (input.excludedNewerMainCommits ?? [])
    .map(commit => ({
      sha: fullSha(commit.sha, 'excluded main commit SHA'),
      subject: text(commit.subject, 'excluded main commit subject', { required: true }),
    }))
    .sort((left, right) => (left.sha < right.sha ? -1 : left.sha > right.sha ? 1 : 0));
  const categoryOrder = ['Breaking changes', 'Features', 'Fixes', 'Documentation', 'Other changes'];
  const categorized = Object.fromEntries(categoryOrder.map(category => [category, []]));
  for (const pr of pullRequests) {
    if (pr.labels.includes('release-notes/exclude') || pr.labels.includes('dependencies')) continue;
    const category = pr.labels.includes('release-notes/major')
      ? 'Breaking changes'
      : pr.labels.some(label => ['enhancement', 'release-notes/minor'].includes(label))
        ? 'Features'
        : pr.labels.some(label => ['bug', 'release-notes/patch'].includes(label))
          ? 'Fixes'
          : pr.labels.includes('documentation')
            ? 'Documentation'
            : 'Other changes';
    categorized[category].push(pr);
  }
  const generatedNotes = categoryOrder
    .filter(category => categorized[category].length > 0)
    .map(
      category =>
        `## ${category}\n${categorized[category].map(pr => `- ${pr.title} (#${pr.number})`).join('\n')}`
    )
    .join('\n\n');
  return normalizeCanonicalValue({
    schema: INVENTORY_SCHEMA,
    compareUrl: text(input.compareUrl, 'compareUrl', { required: true }),
    pullRequests,
    commits,
    changedPaths,
    changedTopLevelPaths: [...new Set(changedPaths.map(path => path.split('/')[0]))].sort(),
    excludedNewerMainCommits,
    categorized,
    generatedNotes,
  });
}

function requestIdentity(request) {
  return canonicalHash({ schema: REQUEST_SCHEMA, request });
}

function composeReleaseNotes(request) {
  return [
    request.generatedNotes,
    request.releaseReason === 'emergency' ? `## Emergency release\n${request.rationale}` : '',
    request.operatorNotes ? `## Operator notes\n${request.operatorNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function validateRequestPlanRecord(plan) {
  exactKeys(
    plan,
    [
      'schema',
      'protocol',
      'requestIdentity',
      'request',
      'releaseNotes',
      'source',
      'attestation',
      'inventory',
    ],
    'requestPlan'
  );
  if (plan.schema !== REQUEST_SCHEMA || plan.protocol !== RELEASE_PROTOCOL) {
    fail('INVALID_SCHEMA', 'unsupported request-plan schema or protocol');
  }
  exactKeys(
    plan.request,
    [
      'repository',
      'workflowRef',
      'targetSha',
      'previousTag',
      'nextTag',
      'bump',
      'releaseReason',
      'rationale',
      'generatedNotes',
      'operatorNotes',
    ],
    'requestPlan.request'
  );
  exactKeys(plan.source, ['controllerSha', 'candidateSha', 'remoteMainSha'], 'requestPlan.source');
  exactKeys(
    plan.attestation,
    [
      'previousReleaseSha',
      'candidateCommitTimestamp',
      'candidateBehindMainBy',
      'expectedAliases',
      'expectedAssetNames',
      'verificationCommands',
    ],
    'requestPlan.attestation'
  );
  normalizeDispatch({ ...plan.request, controllerSha: plan.source.controllerSha });
  text(plan.request.generatedNotes, 'generatedNotes');
  fullSha(plan.source.candidateSha, 'candidateSha');
  fullSha(plan.source.remoteMainSha, 'remoteMainSha');
  fullSha(plan.attestation.previousReleaseSha, 'previousReleaseSha');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(plan.attestation.candidateCommitTimestamp)) {
    fail('INVALID_SCHEMA', 'candidateCommitTimestamp must be a UTC second timestamp');
  }
  if (
    !Number.isSafeInteger(plan.attestation.candidateBehindMainBy) ||
    plan.attestation.candidateBehindMainBy < 0
  ) {
    fail('INVALID_SCHEMA', 'candidateBehindMainBy must be a non-negative integer');
  }
  for (const [field, values] of [
    ['expectedAliases', plan.attestation.expectedAliases],
    ['expectedAssetNames', plan.attestation.expectedAssetNames],
    ['verificationCommands', plan.attestation.verificationCommands],
  ]) {
    if (!Array.isArray(values) || values.length === 0) {
      fail('INVALID_SCHEMA', `${field} must be a non-empty array`);
    }
    values.forEach(value => text(value, field, { required: true }));
  }
  if (
    plan.source.candidateSha !== plan.request.targetSha ||
    calculateNextTag(plan.request.previousTag, plan.request.bump) !== plan.request.nextTag
  ) {
    fail('INVALID_SCHEMA', 'request plan source or version is inconsistent');
  }
  const rebuiltInventory = buildReleaseInventory(plan.inventory);
  if (
    plan.requestIdentity !== requestIdentity(plan.request) ||
    plan.releaseNotes !== composeReleaseNotes(plan.request) ||
    plan.inventory.schema !== INVENTORY_SCHEMA ||
    plan.inventory.generatedNotes !== plan.request.generatedNotes ||
    canonicalize(rebuiltInventory) !== canonicalize(plan.inventory)
  ) {
    fail('INVALID_SCHEMA', 'request plan is not internally consistent');
  }
  return plan;
}

function validateReleaseContentRecord(content, requestPlan) {
  exactKeys(
    content,
    [
      'schema',
      'requestIdentity',
      'artifactHashes',
      'sourceDigests',
      'toolchain',
      'deploymentConfigDigest',
      'verification',
      'contentIdentity',
    ],
    'releaseContent'
  );
  if (
    content.schema !== CONTENT_SCHEMA ||
    content.requestIdentity !== requestPlan.requestIdentity
  ) {
    fail('INVALID_SCHEMA', 'release content schema or request identity is invalid');
  }
  exactKeys(content.sourceDigests, ['worker', 'lockfile'], 'releaseContent.sourceDigests');
  exactKeys(content.toolchain, ['esbuild', 'wrangler'], 'releaseContent.toolchain');
  exactKeys(content.verification, ['contract', 'result'], 'releaseContent.verification');
  text(content.toolchain.esbuild, 'esbuild version', { required: true, max: 100 });
  text(content.toolchain.wrangler, 'wrangler version', { required: true, max: 100 });
  text(content.verification.contract, 'verification contract', { required: true, max: 200 });
  const artifactEntries = Object.entries(content.artifactHashes);
  if (artifactEntries.length === 0) fail('INVALID_SCHEMA', 'artifactHashes cannot be empty');
  for (const [name, hash] of artifactEntries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) fail('INVALID_SCHEMA', 'invalid artifact name');
    digest(hash, `artifact ${name}`);
  }
  digest(content.sourceDigests.worker, 'worker source');
  digest(content.sourceDigests.lockfile, 'lockfile');
  digest(content.deploymentConfigDigest, 'deploymentConfigDigest');
  if (!['passed', 'failed'].includes(content.verification.result)) {
    fail('INVALID_SCHEMA', 'verification result must be passed or failed');
  }
  const payload = { ...content };
  delete payload.contentIdentity;
  if (content.contentIdentity !== canonicalHash(payload)) {
    fail('INVALID_SCHEMA', 'release content identity is invalid');
  }
  return content;
}

function validateFinalPlanRecord(finalPlan, requestPlan, releaseContent) {
  exactKeys(
    finalPlan,
    [
      'schema',
      'protocol',
      'requestIdentity',
      'contentIdentity',
      'requestPlanHash',
      'repository',
      'targetSha',
      'controllerSha',
      'remoteMainSha',
      'tag',
      'requiredAssets',
      'planIdentity',
    ],
    'finalPlan'
  );
  const payload = { ...finalPlan };
  delete payload.planIdentity;
  const valid =
    finalPlan.schema === RELEASE_PROTOCOL &&
    finalPlan.protocol === RELEASE_PROTOCOL &&
    finalPlan.requestIdentity === requestPlan.requestIdentity &&
    finalPlan.requestPlanHash === canonicalHash(requestPlan) &&
    finalPlan.repository === requestPlan.request.repository &&
    finalPlan.targetSha === requestPlan.request.targetSha &&
    finalPlan.controllerSha === requestPlan.source.controllerSha &&
    finalPlan.remoteMainSha === requestPlan.source.remoteMainSha &&
    finalPlan.tag === requestPlan.request.nextTag &&
    /^sha256:[0-9a-f]{64}$/.test(finalPlan.contentIdentity) &&
    canonicalize(finalPlan.requiredAssets) === canonicalize(requiredAssetsFor(requestPlan)) &&
    finalPlan.planIdentity === canonicalHash(payload) &&
    (!releaseContent || finalPlan.contentIdentity === releaseContent.contentIdentity);
  if (!valid) fail('INVALID_SCHEMA', 'final release plan is not internally consistent');
  return finalPlan;
}

function requiredAssetsFor(requestPlan) {
  return [
    ...new Set([
      ...requestPlan.attestation.expectedAssetNames,
      'request-plan.json',
      'release-content.json',
      'final-release-plan.json',
      'checksums.sha256',
    ]),
  ].sort();
}

export function buildRequestPlan(input) {
  const dispatch = normalizeDispatch(input.dispatch);
  if (input.controllerSha !== dispatch.controllerSha) {
    fail('CONTROLLER_MISMATCH', 'request and authenticated controller SHAs differ');
  }
  if (!input.inventory || input.generatedNotes !== input.inventory.generatedNotes) {
    fail('INVENTORY_MISMATCH', 'generated notes must come from the complete compare inventory');
  }
  exactKeys(
    input.inventory,
    [
      'schema',
      'compareUrl',
      'pullRequests',
      'commits',
      'changedPaths',
      'changedTopLevelPaths',
      'excludedNewerMainCommits',
      'categorized',
      'generatedNotes',
    ],
    'inventory'
  );
  if (input.inventory.schema !== INVENTORY_SCHEMA) fail('INVALID_SCHEMA', 'unsupported inventory');
  const attestation = input.attestation;
  if (!attestation || !Number.isSafeInteger(attestation.candidateBehindMainBy)) {
    fail('INVALID_ATTESTATION', 'complete deterministic release-readiness fields are required');
  }
  const normalizedAttestation = normalizeCanonicalValue({
    previousReleaseSha: fullSha(attestation.previousReleaseSha, 'previousReleaseSha'),
    candidateCommitTimestamp: text(
      attestation.candidateCommitTimestamp,
      'candidateCommitTimestamp',
      {
        required: true,
      }
    ),
    candidateBehindMainBy: attestation.candidateBehindMainBy,
    expectedAliases: (attestation.expectedAliases ?? []).map(alias =>
      text(alias, 'expected alias', { required: true })
    ),
    expectedAssetNames: (attestation.expectedAssetNames ?? []).map(asset =>
      text(asset, 'expected asset', { required: true })
    ),
    verificationCommands: (attestation.verificationCommands ?? []).map(command =>
      text(command, 'verification command', { required: true })
    ),
  });
  if (
    normalizedAttestation.candidateBehindMainBy < 0 ||
    normalizedAttestation.expectedAssetNames.length === 0 ||
    normalizedAttestation.verificationCommands.length === 0
  ) {
    fail('INVALID_ATTESTATION', 'behind count, assets, and verification contract are invalid');
  }
  const request = normalizeCanonicalValue({
    repository: dispatch.repository,
    workflowRef: dispatch.workflowRef,
    targetSha: dispatch.targetSha,
    previousTag: input.previousTag,
    nextTag: input.nextTag,
    bump: dispatch.bump,
    releaseReason: dispatch.releaseReason,
    rationale: dispatch.rationale,
    generatedNotes: input.generatedNotes,
    operatorNotes: dispatch.operatorNotes,
  });
  if (calculateNextTag(request.previousTag, request.bump) !== request.nextTag) {
    fail('VERSION_MISMATCH', 'nextTag does not match the explicit bump');
  }
  const releaseNotes = composeReleaseNotes(request);
  const plan = normalizeCanonicalValue({
    schema: REQUEST_SCHEMA,
    protocol: RELEASE_PROTOCOL,
    requestIdentity: requestIdentity(request),
    request,
    releaseNotes,
    source: {
      controllerSha: fullSha(input.controllerSha, 'controllerSha'),
      candidateSha: dispatch.targetSha,
      remoteMainSha: fullSha(input.remoteMainSha, 'remoteMainSha'),
    },
    attestation: normalizedAttestation,
    inventory: input.inventory,
  });
  return validateRequestPlanRecord(plan);
}

export function buildReleaseContent(input) {
  validateRequestPlanRecord(input.requestPlan);
  const artifactEntries = Object.entries(input.artifactHashes ?? {});
  if (artifactEntries.length === 0) fail('INVALID_SCHEMA', 'artifactHashes cannot be empty');
  for (const [name, hash] of artifactEntries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) fail('INVALID_SCHEMA', 'invalid artifact name');
    digest(hash, `artifact ${name}`);
  }
  exactKeys(input.sourceDigests, ['worker', 'lockfile'], 'sourceDigests');
  digest(input.sourceDigests.worker, 'worker source');
  digest(input.sourceDigests.lockfile, 'lockfile');
  exactKeys(input.toolchain, ['esbuild', 'wrangler'], 'toolchain');
  exactKeys(input.verification, ['contract', 'result'], 'verification');
  if (!['passed', 'failed'].includes(input.verification.result)) {
    fail('INVALID_SCHEMA', 'verification result must be passed or failed');
  }
  digest(input.deploymentConfigDigest, 'deploymentConfigDigest');
  const payload = normalizeCanonicalValue({
    schema: CONTENT_SCHEMA,
    requestIdentity: input.requestPlan.requestIdentity,
    artifactHashes: input.artifactHashes,
    sourceDigests: input.sourceDigests,
    toolchain: input.toolchain,
    deploymentConfigDigest: input.deploymentConfigDigest,
    verification: input.verification,
  });
  return validateReleaseContentRecord(
    { ...payload, contentIdentity: canonicalHash(payload) },
    input.requestPlan
  );
}

export function buildFinalPlan({ requestPlan, releaseContent }) {
  validateRequestPlanRecord(requestPlan);
  validateReleaseContentRecord(releaseContent, requestPlan);
  for (const asset of requestPlan.attestation.expectedAssetNames) {
    if (!releaseContent.artifactHashes[asset]) {
      fail('MISSING_ARTIFACT_HASH', `${asset} is absent from release content`);
    }
  }
  const requiredAssets = requiredAssetsFor(requestPlan);
  const payload = normalizeCanonicalValue({
    schema: RELEASE_PROTOCOL,
    protocol: RELEASE_PROTOCOL,
    requestIdentity: requestPlan.requestIdentity,
    contentIdentity: releaseContent.contentIdentity,
    requestPlanHash: canonicalHash(requestPlan),
    repository: requestPlan.request.repository,
    targetSha: requestPlan.request.targetSha,
    controllerSha: requestPlan.source.controllerSha,
    remoteMainSha: requestPlan.source.remoteMainSha,
    tag: requestPlan.request.nextTag,
    requiredAssets,
  });
  return validateFinalPlanRecord(
    { ...payload, planIdentity: canonicalHash(payload) },
    requestPlan,
    releaseContent
  );
}

export function buildPublicationMarker(finalPlan) {
  return normalizeCanonicalValue({
    schema: MARKER_SCHEMA,
    protocol: RELEASE_PROTOCOL,
    planIdentity: finalPlan.planIdentity,
    requestIdentity: finalPlan.requestIdentity,
    contentIdentity: finalPlan.contentIdentity,
    targetSha: finalPlan.targetSha,
    tag: finalPlan.tag,
  });
}

export function buildAuditEnvelope({ finalPlan, execution }) {
  return normalizeCanonicalValue({
    schema: AUDIT_SCHEMA,
    planIdentity: finalPlan.planIdentity,
    execution,
  });
}

function authenticateCompleted(release, dispatch) {
  const { requestPlan, releaseContent, finalPlan, marker, assetVerification } = release;
  if (!requestPlan || !releaseContent || !finalPlan || !marker) {
    fail('COMPLETED_PLAN_INCOMPLETE', 'published Release lacks authenticated identity records');
  }
  validateRequestPlanRecord(requestPlan);
  validateReleaseContentRecord(releaseContent, requestPlan);
  validateFinalPlanRecord(finalPlan, requestPlan, releaseContent);
  const compared = [
    'repository',
    'workflowRef',
    'targetSha',
    'bump',
    'releaseReason',
    'rationale',
    'operatorNotes',
  ];
  for (const field of compared) {
    if (requestPlan.request?.[field] !== dispatch[field]) {
      fail('COMPLETED_PLAN_CONFLICT', `published request differs at ${field}`);
    }
  }
  const contentPayload = { ...releaseContent };
  delete contentPayload.contentIdentity;
  const finalPayload = { ...finalPlan };
  delete finalPayload.planIdentity;
  const expectedMarker = buildPublicationMarker(finalPlan);
  exactKeys(
    assetVerification ?? {},
    [
      'complete',
      'checksumsMatch',
      'unexpectedConflicts',
      'planIdentity',
      'contentIdentity',
      'verifiedAssetNames',
    ],
    'assetVerification'
  );
  const verifiedAssetNames = [...(assetVerification?.verifiedAssetNames ?? [])].sort();
  const valid =
    requestPlan.schema === REQUEST_SCHEMA &&
    requestPlan.protocol === RELEASE_PROTOCOL &&
    releaseContent.schema === CONTENT_SCHEMA &&
    finalPlan.schema === RELEASE_PROTOCOL &&
    finalPlan.protocol === RELEASE_PROTOCOL &&
    requestPlan.requestIdentity === requestIdentity(requestPlan.request) &&
    releaseContent.requestIdentity === requestPlan.requestIdentity &&
    releaseContent.contentIdentity === canonicalHash(contentPayload) &&
    finalPlan.requestIdentity === requestPlan.requestIdentity &&
    finalPlan.contentIdentity === releaseContent.contentIdentity &&
    finalPlan.requestPlanHash === canonicalHash(requestPlan) &&
    finalPlan.planIdentity === canonicalHash(finalPayload) &&
    canonicalize(marker) === canonicalize(expectedMarker) &&
    finalPlan.tag === release.tag &&
    finalPlan.targetSha === release.targetSha &&
    TAG_PATTERN.test(release.tag) &&
    release.resolvedTagSha === release.targetSha &&
    assetVerification?.complete === true &&
    assetVerification.checksumsMatch === true &&
    assetVerification.unexpectedConflicts === false &&
    assetVerification.planIdentity === finalPlan.planIdentity &&
    assetVerification.contentIdentity === releaseContent.contentIdentity &&
    canonicalize(verifiedAssetNames) === canonicalize(finalPlan.requiredAssets);
  if (!valid) fail('COMPLETED_PLAN_CONFLICT', 'published identity records do not authenticate');
  return { kind: 'completed', release, planIdentity: finalPlan.planIdentity };
}

export function findCompletedPlan({ dispatch, releases, containsTarget }) {
  const published = releases.filter(
    release => release.published && !release.draft && !release.prerelease
  );
  const exact = published.filter(release => release.targetSha === dispatch.targetSha);
  if (exact.length > 1)
    fail('COMPLETED_PLAN_AMBIGUOUS', 'multiple published Releases target this SHA');
  if (exact.length === 1) return authenticateCompleted(exact[0], dispatch);
  const containing = published
    .filter(release => TAG_PATTERN.test(release.tag))
    .find(release => containsTarget(dispatch.targetSha, release.targetSha));
  return containing ? { kind: 'already-contained', release: containing } : { kind: 'none' };
}

export function revalidatePlan({ requestPlan, releases, containsTarget, snapshot, current }) {
  const dispatch = normalizeDispatch({
    ...requestPlan.request,
    controllerSha: requestPlan.source.controllerSha,
  });
  const completed = findCompletedPlan({ dispatch, releases, containsTarget });
  if (completed.kind !== 'none') return completed;
  const { candidateStillReachable = true, ...currentState } = current;
  if (candidateStillReachable === false || canonicalize(snapshot) !== canonicalize(currentState)) {
    fail('STALE_PLAN', 'main, frontier, tag, draft, or candidate state changed');
  }
  return { kind: 'current', planIdentity: requestPlan.requestIdentity };
}

export function resolvePartialPublication({ state, requestPlan, storedFinalPlan }) {
  validateRequestPlanRecord(requestPlan);
  const tag = requestPlan.request.nextTag;
  const ref = state.refs.find(item => item.tag === tag);
  const draft = state.releases.find(item => item.tag === tag && item.draft === true);
  if (!ref && !draft) return { kind: 'none' };
  if (!storedFinalPlan) fail('PARTIAL_PLAN_UNAUTHENTICATED', `${tag} has no stored final plan`);
  validateFinalPlanRecord(storedFinalPlan, requestPlan);
  const storedPayload = { ...storedFinalPlan };
  delete storedPayload.planIdentity;
  if (storedFinalPlan.planIdentity !== canonicalHash(storedPayload)) {
    fail('PARTIAL_PLAN_UNAUTHENTICATED', `${tag} final plan identity is invalid`);
  }
  const expected = {
    requestIdentity: requestPlan.requestIdentity,
    requestPlanHash: canonicalHash(requestPlan),
    targetSha: requestPlan.request.targetSha,
    tag,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (storedFinalPlan[field] !== value)
      fail('PARTIAL_PLAN_CONFLICT', `${tag} differs at ${field}`);
  }
  if (ref && ref.sha !== expected.targetSha)
    fail('PARTIAL_PLAN_CONFLICT', `${tag} ref targets another SHA`);
  if (draft && draft.targetSha !== expected.targetSha)
    fail('PARTIAL_PLAN_CONFLICT', `${tag} draft targets another SHA`);
  if ((ref && ref.kind !== 'annotated') || (draft && !ref)) {
    fail('PARTIAL_PLAN_CONFLICT', `${tag} is not an annotated workflow tag`);
  }
  if ((ref && !ref.marker) || (draft && !draft.marker)) {
    fail('PARTIAL_PLAN_UNAUTHENTICATED', `${tag} is missing its identity marker`);
  }
  const expectedMarker = buildPublicationMarker(storedFinalPlan);
  const recordedMarkers = [ref?.marker, draft?.marker].filter(Boolean);
  if (recordedMarkers.some(marker => canonicalize(marker) !== canonicalize(expectedMarker))) {
    fail('PARTIAL_PLAN_CONFLICT', `${tag} records another release-plan identity`);
  }
  return {
    kind: 'resume',
    tag,
    planIdentity: storedFinalPlan.planIdentity,
    nextSteps: draft
      ? ['verify-assets', 'publish-draft']
      : ['create-draft', 'verify-assets', 'publish-draft'],
  };
}

export function selectStoredController(input) {
  fullSha(input.storedControllerSha, 'storedControllerSha');
  if (!input.supportedProtocols.includes(input.storedProtocol)) {
    fail('UNSUPPORTED_STORED_PROTOCOL', `cannot resume ${input.storedProtocol}`);
  }
  if (input.controllerReachableFromMain !== true) {
    fail('UNAUTHENTICATED_CONTROLLER', 'stored controller is not in main history');
  }
  return input.storedControllerSha;
}

function printHelp() {
  console.log(
    `Usage: node scripts/release/plan.mjs [--help]\n\nRead-only release planning library. The GitHub workflow supplies authenticated inputs and API state; this command never publishes, tags, deploys, or reads credentials.`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.length === 3 && ['--help', '-h'].includes(process.argv[2])) printHelp();
  else
    fail(
      'CLI_ADAPTER_REQUIRED',
      'use --help or call the exported planning API with authenticated adapters'
    );
}
