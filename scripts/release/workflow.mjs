#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize, compareUtf8 } from './canonical-json.mjs';
import { buildFinalPlan, buildReleaseContent, normalizeDispatch } from './plan.mjs';
import { createRecoveryEvidence } from './production-state.mjs';
import { validatePublicationBundle } from './publication.mjs';
import { hashStaticTree, validateStaticTreeRecord } from './static-tree.mjs';

const WORKFLOW_PROTOCOL = 'bugdrop.release-workflow/v1';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const IDENTITY_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export class WorkflowProtocolError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, details, name: 'WorkflowProtocolError' });
  }
}

function fail(code, message, details) {
  throw new WorkflowProtocolError(code, message, details);
}

function match(value, pattern, field) {
  if (!pattern.test(value ?? '')) fail('INVALID_WORKFLOW_INPUT', `${field} is invalid`);
  return value;
}

const same = (left, right) => canonicalize(left) === canonicalize(right);

function base(result) {
  return { protocol: WORKFLOW_PROTOCOL, ...result };
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function createState2Bundle(input) {
  const candidateAssets = input?.candidateAssets;
  if (!candidateAssets || candidateAssets.constructor !== Object) {
    fail('INVALID_STATE2_INPUT', 'candidateAssets must be an object of bytes');
  }
  const artifactHashes = {};
  for (const [name, bytes] of Object.entries(candidateAssets)) {
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      fail('INVALID_STATE2_INPUT', `${name} must contain bytes`);
    }
    artifactHashes[name] = sha256(bytes);
  }
  const releaseContent = buildReleaseContent({
    requestPlan: input.requestPlan,
    artifactHashes,
    sourceDigests: input.sourceDigests,
    toolchain: input.toolchain,
    deploymentConfigDigest: input.deploymentConfigDigest,
    verification: input.verification,
    ...(input.staticPackage
      ? { publicationAssetHashes: artifactHashes, staticPackage: input.staticPackage }
      : {}),
  });
  const finalPlan = buildFinalPlan({ requestPlan: input.requestPlan, releaseContent });
  const assets = {
    ...candidateAssets,
    'request-plan.json': Buffer.from(`${canonicalize(input.requestPlan)}\n`),
    'release-content.json': Buffer.from(`${canonicalize(releaseContent)}\n`),
    'final-release-plan.json': Buffer.from(`${canonicalize(finalPlan)}\n`),
  };
  const checksums = Object.entries(assets)
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
    .join('\n');
  assets['checksums.sha256'] = Buffer.from(`${checksums}\n`);
  validatePublicationBundle({
    requestPlan: input.requestPlan,
    releaseContent,
    finalPlan,
    assets,
  });
  return { requestPlan: input.requestPlan, releaseContent, finalPlan, assets };
}

async function readCanonicalJson(path, field) {
  const bytes = await readFile(path);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('INVALID_STATIC_PACKAGE', `${field} is not JSON`);
  }
  if (!bytes.equals(Buffer.from(`${canonicalize(value)}\n`))) {
    fail('INVALID_STATIC_PACKAGE', `${field} is not canonical`);
  }
  return value;
}

function expectedChecksums(fileHashes) {
  return `${Object.entries(fileHashes)
    .filter(([path]) => path !== 'checksums.sha256')
    .sort(([left], [right]) => compareUtf8(left, right))
    .map(([path, digest]) => `${digest}  ${path}`)
    .join('\n')}\n`;
}

async function validateStaticPackageSemantics(input, staticPackage) {
  const root = input.staticPackageDir;
  const requestPlan = input.requestPlan;
  const retention = requestPlan.retention;
  const version = requestPlan.request.nextTag.slice(1);
  const exactFilename = `widget.v${version}.js`;
  const hashes = staticPackage.fileHashes;
  const manifest = await readCanonicalJson(join(root, 'versions.json'), 'versions.json');
  const metadata = await readCanonicalJson(
    join(root, 'static-package.json'),
    'static-package.json'
  );
  const checksumBytes = await readFile(join(root, 'checksums.sha256'), 'utf8');
  if (checksumBytes !== expectedChecksums(hashes)) {
    fail('STATIC_CHECKSUM_MISMATCH', 'checksums.sha256 does not bind the exact static tree');
  }
  const publicationNames = [...requestPlan.attestation.expectedAssetNames].sort(compareUtf8);
  if (!same(publicationNames, [exactFilename, 'versions.json'].sort(compareUtf8))) {
    fail('INVALID_STATIC_PACKAGE', 'publication asset names do not match the candidate version');
  }
  const currentHash = hashes[exactFilename];
  if (
    !currentHash ||
    manifest.current !== version ||
    manifest.repository !== requestPlan.request.repository ||
    manifest.authoritative !== true ||
    manifest.mode !== 'release' ||
    manifest.latest !== 'widget.js' ||
    manifest.generatedAt !== requestPlan.attestation.candidateCommitTimestamp ||
    metadata.schema !== 'bugdrop.static-package/v1' ||
    metadata.mode !== 'release' ||
    metadata.version !== version ||
    metadata.targetSha !== requestPlan.request.targetSha ||
    metadata.timestamp !== requestPlan.attestation.candidateCommitTimestamp
  ) {
    fail('INVALID_STATIC_PACKAGE', 'manifest current identity differs from the request');
  }
  const aliases = requestPlan.attestation.expectedAliases;
  if (!Array.isArray(aliases) || aliases.some(alias => hashes[alias] !== currentHash)) {
    fail('STATIC_ALIAS_MISMATCH', 'every approved alias must contain exact current bytes');
  }
  const exactPaths = Object.keys(hashes)
    .filter(path => /^widget\.v\d+\.\d+\.\d+\.js$/.test(path))
    .sort(compareUtf8);
  const expectedRetained = retention?.expectedRetainedVersions ?? [];
  const expectedExactPaths = [
    ...expectedRetained.map(item => `widget.v${item}.js`),
    exactFilename,
  ].sort(compareUtf8);
  if (!same(exactPaths, expectedExactPaths)) {
    fail('RETAINED_SET_MISMATCH', 'static exact-version paths differ from the approved set');
  }
  const aliasTargets = new Map();
  for (const candidate of [...expectedRetained, version]) {
    const [major, minor] = candidate.split('.');
    for (const line of [major, `${major}.${minor}`]) {
      const previous = aliasTargets.get(line);
      const currentParts = candidate.split('.').map(BigInt);
      const previousParts = previous?.split('.').map(BigInt);
      if (
        !previousParts ||
        currentParts.some(
          (part, index) =>
            part > previousParts[index] &&
            currentParts.slice(0, index).every((value, prior) => value === previousParts[prior])
        )
      ) {
        aliasTargets.set(line, candidate);
      }
    }
  }
  const expectedVersions = Object.fromEntries(
    [
      ...expectedExactPaths.map(path => [`v${path.slice(8, -3)}`, path]),
      ...[...aliasTargets.keys()].map(line => [`v${line}`, `widget.v${line}.js`]),
    ].sort(([left], [right]) => compareUtf8(left, right))
  );
  for (const [line, targetVersion] of aliasTargets) {
    if (hashes[`widget.v${line}.js`] !== hashes[`widget.v${targetVersion}.js`]) {
      fail('STATIC_ALIAS_MISMATCH', `stable alias v${line} differs from its newest exact asset`);
    }
  }
  if (!same(manifest.versions, expectedVersions)) {
    fail('RETENTION_MANIFEST_MISMATCH', 'manifest version map differs from approved paths');
  }
  if (retention?.mode === 'bootstrap' || retention?.mode === 'continue') {
    if (
      manifest.schema !== 'bugdrop.versions-manifest/v2' ||
      manifest.cutoverVersion !== retention.cutoverVersion ||
      !same(
        Object.keys(manifest.artifacts ?? {}).sort(compareUtf8),
        [...expectedRetained.map(item => `v${item}`), `v${version}`].sort(compareUtf8)
      )
    ) {
      fail(
        'RETENTION_MANIFEST_MISMATCH',
        'v2 manifest does not project the approved retention set'
      );
    }
    for (const record of retention.releases) {
      const expected = {
        downloadUrl: record.asset.downloadUrl,
        filename: record.asset.name,
        sha256: record.asset.sha256,
        tag: record.tag,
        targetSha: record.targetSha,
        version: record.version,
      };
      if (
        !same(manifest.artifacts[`v${record.version}`], expected) ||
        hashes[record.asset.name] !== record.asset.sha256
      ) {
        fail('RETAINED_BYTE_MISMATCH', `retained v${record.version} differs from its authority`);
      }
    }
    const current = manifest.artifacts[`v${version}`];
    const expectedCurrent = {
      downloadUrl: `https://github.com/${requestPlan.request.repository}/releases/download/${requestPlan.request.nextTag}/${exactFilename}`,
      filename: exactFilename,
      sha256: currentHash,
      tag: requestPlan.request.nextTag,
      targetSha: requestPlan.request.targetSha,
      version,
    };
    if (!same(current, expectedCurrent)) {
      fail('INVALID_STATIC_PACKAGE', 'current manifest record differs from current bytes');
    }
  } else {
    const expectedCurrent = {
      archiveUrl: `https://github.com/${requestPlan.request.repository}/releases/download/${requestPlan.request.nextTag}/${exactFilename}`,
      filename: exactFilename,
      publishedAt: requestPlan.attestation.candidateCommitTimestamp,
      sha256: currentHash,
      targetSha: requestPlan.request.targetSha,
    };
    if (
      retention?.mode !== 'disabled' ||
      manifest.schema !== 'bugdrop.versions-manifest/v1' ||
      manifest.cutoverVersion !== version ||
      expectedRetained.length !== 0 ||
      exactPaths.length !== 1 ||
      !same(Object.keys(manifest.artifacts ?? {}), [`v${version}`]) ||
      !same(manifest.artifacts[`v${version}`], expectedCurrent)
    ) {
      fail(
        'RETENTION_MANIFEST_MISMATCH',
        'disabled retention must preserve v1 current-only output'
      );
    }
  }
  return manifest;
}

/** Installed State-2 boundary: enumerate the deployment tree independently of the builder. */
export async function createState2BundleFromStaticPackage(input) {
  if (!input.builderResultPath) {
    fail('INVALID_STATE2_INPUT', 'installed State 2 requires the controller builder result');
  }
  const builderResult = await readCanonicalJson(input.builderResultPath, 'builder result');
  if (
    builderResult?.schema !== 'bugdrop.builder-result/v1' ||
    builderResult.requestIdentity !== input.requestPlan.requestIdentity ||
    !same(Object.keys(builderResult).sort(compareUtf8), [
      'requestIdentity',
      'schema',
      'staticPackage',
    ])
  ) {
    fail('BUILDER_RESULT_MISMATCH', 'builder result does not bind the approved request');
  }
  const builtStaticPackage = validateStaticTreeRecord(builderResult.staticPackage);
  const staticPackage = await hashStaticTree(input.staticPackageDir);
  if (staticPackage.contentIdentity !== builtStaticPackage.contentIdentity) {
    fail('BUILDER_RESULT_MISMATCH', 'static tree changed after controller package generation');
  }
  await validateStaticPackageSemantics(input, staticPackage);
  const names = input.requestPlan.attestation.expectedAssetNames;
  const candidateAssets = Object.fromEntries(
    await Promise.all(
      names.map(async name => [name, await readFile(join(input.staticPackageDir, name))])
    )
  );
  return createState2Bundle({ ...input, candidateAssets, staticPackage });
}

export function validateControllerContext(input) {
  if (input?.eventName !== 'workflow_dispatch') {
    fail('UNTRUSTED_EVENT', 'release workflow must be dispatched manually');
  }
  if (input.ref !== 'refs/heads/main') {
    fail('UNTRUSTED_REF', 'release workflow must be dispatched from main');
  }
  const workflowSha = match(input.workflowSha, SHA_PATTERN, 'workflowSha');
  if (input.candidateReachableFromMain !== true) {
    fail('UNTRUSTED_CANDIDATE', 'candidate must be reachable from remote main');
  }
  const dispatch = normalizeDispatch(input.dispatch);
  if (dispatch.controllerSha !== workflowSha) {
    fail('CONTROLLER_MISMATCH', 'dispatch controller must equal the immutable workflow SHA');
  }
  return base({
    status: 'guarded',
    controllerSha: workflowSha,
    targetSha: dispatch.targetSha,
    dryRun: dispatch.dryRun,
    dispatch,
  });
}

function verifyArtifact(expected, artifact) {
  if (
    artifact?.available !== true ||
    !SAFE_ID_PATTERN.test(artifact.artifactId ?? '') ||
    artifact.planIdentity !== expected.planIdentity ||
    artifact.contentIdentity !== expected.marker.contentIdentity ||
    artifact.requestIdentity !== expected.marker.requestIdentity ||
    (expected.protocol === 'release-plan/v2' &&
      artifact.staticPackageIdentity !== expected.staticPackageIdentity) ||
    !Array.isArray(artifact.verifiedAssetNames) ||
    !same([...artifact.verifiedAssetNames].sort(compareUtf8), expected.requiredAssets)
  ) {
    fail('ARTIFACT_IDENTITY_MISMATCH', 'immutable State 2 artifact does not match the plan');
  }
}

export function decideState2Path(input) {
  const context = validateControllerContext(input.context);
  const expected = validatePublicationBundle(input.bundle);
  verifyArtifact(expected, input.artifact);
  const completed = input.completed;
  if (completed?.kind === 'completed') {
    if (completed.planIdentity !== expected.planIdentity) {
      fail('COMPLETED_PLAN_MISMATCH', 'completed plan identity differs from State 2');
    }
    return base({
      status: 'core-noop',
      planIdentity: expected.planIdentity,
      mutationAuthorized: false,
      notify: false,
      reason: 'completed-before-approval',
    });
  }
  if (completed?.kind !== 'none') {
    fail('COMPLETED_PLAN_CONFLICT', `cannot continue from ${completed?.kind ?? 'unknown'}`);
  }
  const common = {
    planIdentity: expected.planIdentity,
    contentIdentity: expected.marker.contentIdentity,
    requestIdentity: expected.marker.requestIdentity,
    mutationAuthorized: false,
    notify: false,
  };
  if (context.dryRun) return base({ status: 'dry-run-complete', ...common });
  if (input.productionEnabled !== true) return base({ status: 'live-disabled', ...common });
  return base({ status: 'approval-required', ...common });
}

function exactPlan(record, expected, field) {
  if (record?.planIdentity !== expected) {
    fail('PLAN_IDENTITY_MISMATCH', `${field} does not bind the finalized plan`);
  }
}

export function authorizeLiveMutation(input) {
  const planIdentity = match(input.state2?.planIdentity, IDENTITY_PATTERN, 'planIdentity');
  if (input.state2.status !== 'approval-required') {
    fail('INVALID_PHASE', 'State 2 is not awaiting live approval');
  }
  if (input.productionEnabled !== true) fail('LIVE_DISABLED', 'production release is disabled');
  if (input.capabilityValidated !== true) {
    fail('CAPABILITY_NOT_VALIDATED', 'production command capability is not validated');
  }
  if (input.approval?.status !== 'approved') fail('APPROVAL_REQUIRED', 'approval is missing');
  exactPlan(input.approval, planIdentity, 'approval');
  exactPlan(input.revalidation, planIdentity, 'revalidation');
  if (input.revalidation.kind === 'completed') {
    return base({
      status: 'core-noop',
      planIdentity,
      mutationAuthorized: false,
      notify: false,
      reason: 'concurrent-exact-winner',
    });
  }
  if (input.revalidation.kind !== 'current') {
    fail('STALE_PLAN', `revalidation returned ${input.revalidation.kind ?? 'unknown'}`);
  }
  return base({ status: 'mutation-authorized', planIdentity, notify: false });
}

function stopped(status, reason, planIdentity) {
  return base({
    status,
    reason,
    planIdentity,
    notify: false,
    automaticGitHubCleanup: false,
    automaticProductionCommandAuthorized: false,
  });
}

export function classifyCoreOutcome(input) {
  const planIdentity = match(
    input.authorization?.planIdentity,
    IDENTITY_PATTERN,
    'authorization.planIdentity'
  );
  if (input.authorization.status !== 'mutation-authorized') {
    fail('MUTATION_NOT_AUTHORIZED', 'core outcome requires exact live authorization');
  }
  if (input.deployment?.status === 'ambiguous-critical') {
    return stopped('unknown-critical', 'deployment-authority-ambiguous', planIdentity);
  }
  if (input.deployment?.status !== 'candidate-active') {
    return stopped('recovery-required', 'candidate-not-active', planIdentity);
  }
  if (input.live?.status !== 'passed') {
    return stopped('recovery-required', 'live-verification-failed', planIdentity);
  }
  if (input.publication?.status !== 'not-attempted') {
    exactPlan(input.publication, planIdentity, 'publication');
  }
  if (input.publication.status === 'published') {
    return base({ status: 'core-published', planIdentity, notify: true });
  }
  if (input.publication.status === 'already-published') {
    return base({
      status: 'core-noop',
      planIdentity,
      notify: false,
      reason: 'published-before-this-attempt',
    });
  }
  if (input.publication.status === 'unknown-critical') {
    return stopped('unknown-critical', 'publication-authority-ambiguous', planIdentity);
  }
  return stopped('recovery-required', `publication-${input.publication.status}`, planIdentity);
}

export function createFinalizationDecision(input) {
  if (input.mutationAttempted !== true) {
    return base({
      status: 'no-mutation',
      automaticGitHubCleanup: false,
      automaticProductionCommandAuthorized: false,
    });
  }
  const evidence = createRecoveryEvidence({
    releasePlanIdentity: input.releasePlanIdentity,
    intendedTargetSha: input.targetSha,
    baseline: input.baseline,
    observation: input.observation,
  });
  return base({
    status: 'manual-recovery-required',
    automaticGitHubCleanup: false,
    automaticProductionCommandAuthorized: false,
    evidence,
  });
}

function hydrateBundle(bundle) {
  if (!bundle?.assets) return bundle;
  return {
    ...bundle,
    assets: Object.fromEntries(
      Object.entries(bundle.assets).map(([name, value]) => [
        name,
        Buffer.from(value.base64, 'base64'),
      ])
    ),
  };
}

function dehydrateBundle(bundle) {
  return {
    ...bundle,
    assets: Object.fromEntries(
      Object.entries(bundle.assets).map(([name, value]) => [
        name,
        { base64: value.toString('base64') },
      ])
    ),
  };
}

async function runCli() {
  const [mode, inputPath] = process.argv.slice(2);
  if (!inputPath) fail('INVALID_CLI', 'usage: workflow.mjs MODE INPUT.json');
  const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const operations = {
    guard: validateControllerContext,
    state2: value => decideState2Path({ ...value, bundle: hydrateBundle(value.bundle) }),
    authorize: authorizeLiveMutation,
    bundle: value =>
      dehydrateBundle(
        createState2Bundle({
          ...value,
          candidateAssets: Object.fromEntries(
            Object.entries(value.candidateAssets ?? {}).map(([name, asset]) => [
              name,
              Buffer.from(asset.base64, 'base64'),
            ])
          ),
        })
      ),
    'bundle-static': async value =>
      dehydrateBundle(await createState2BundleFromStaticPackage(value)),
    core: classifyCoreOutcome,
    finalize: createFinalizationDecision,
  };
  if (!operations[mode]) fail('INVALID_CLI', `unsupported mode ${mode ?? '<missing>'}`);
  process.stdout.write(`${canonicalize(await operations[mode](input))}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
