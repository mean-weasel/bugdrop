#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize } from './canonical-json.mjs';
import { buildFinalPlan, buildReleaseContent, normalizeDispatch } from './plan.mjs';
import { createRecoveryEvidence } from './production-state.mjs';
import { validatePublicationBundle } from './publication.mjs';

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
  });
  const finalPlan = buildFinalPlan({ requestPlan: input.requestPlan, releaseContent });
  const assets = {
    ...candidateAssets,
    'request-plan.json': Buffer.from(`${canonicalize(input.requestPlan)}\n`),
    'release-content.json': Buffer.from(`${canonicalize(releaseContent)}\n`),
    'final-release-plan.json': Buffer.from(`${canonicalize(finalPlan)}\n`),
  };
  const checksums = Object.entries(assets)
    .sort(([left], [right]) => left.localeCompare(right))
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
    !Array.isArray(artifact.verifiedAssetNames) ||
    !same([...artifact.verifiedAssetNames].sort(), expected.requiredAssets)
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
    core: classifyCoreOutcome,
    finalize: createFinalizationDecision,
  };
  if (!operations[mode]) fail('INVALID_CLI', `unsupported mode ${mode ?? '<missing>'}`);
  process.stdout.write(`${canonicalize(operations[mode](input))}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
