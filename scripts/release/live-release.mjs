#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { reconcileDeployment, verifyRollback } from './cloudflare-adapter.mjs';
import { createProductionCloudflareClient } from './cloudflare-client.mjs';
import { createGithubPublicationAdapter } from './github-publication-adapter.mjs';
import {
  classifyPublicationState,
  executePublication,
  validatePublicationBundle,
} from './publication.mjs';
import { canonicalize } from './canonical-json.mjs';
import { collectRecoveryIdentity, pollLiveVerification } from './verify-live.mjs';

const PROTOCOL = 'bugdrop.live-release/v1';
const SHA = /^[0-9a-f]{40}$/;
const IDENTITY = /^sha256:[0-9a-f]{64}$/;
const TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export class LiveReleaseError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, name: 'LiveReleaseError' });
  }
}

function fail(code, message) {
  throw new LiveReleaseError(code, message);
}

function match(value, pattern, field) {
  if (!pattern.test(value ?? '')) fail('INVALID_LIVE_RELEASE_INPUT', `${field} is invalid`);
  return value;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function hydratedBundle(bundle) {
  if (!bundle?.assets) return bundle;
  return {
    ...bundle,
    assets: Object.fromEntries(
      Object.entries(bundle.assets).map(([name, value]) => [
        name,
        Buffer.isBuffer(value) ? value : Buffer.from(value.base64, 'base64'),
      ])
    ),
  };
}

export async function buildExpectedLive({ bundle: rawBundle, origin, staticPackageDir }) {
  const bundle = hydratedBundle(rawBundle);
  const expectedPublication = validatePublicationBundle(bundle);
  const tag = match(expectedPublication.tag, TAG, 'tag');
  const version = tag.slice(1);
  const exactFilename = `widget.${tag}.js`;
  const aliases = bundle.requestPlan.attestation.expectedAliases;
  const exactBytes = await readFile(resolve(staticPackageDir, exactFilename));
  const manifestBytes = await readFile(resolve(staticPackageDir, 'versions.json'));
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    fail('INVALID_STATIC_PACKAGE', 'versions.json is not valid JSON');
  }
  if (
    !Array.isArray(aliases) ||
    aliases.length === 0 ||
    manifest?.current !== version ||
    manifest?.artifacts?.[`v${version}`]?.filename !== exactFilename
  ) {
    fail('INVALID_STATIC_PACKAGE', 'static package does not match the approved release plan');
  }
  const widgetSha256 = sha256(exactBytes);
  const manifestSha256 = sha256(manifestBytes);
  if (
    bundle.releaseContent.artifactHashes[exactFilename] !== widgetSha256 ||
    bundle.releaseContent.artifactHashes['versions.json'] !== manifestSha256
  ) {
    fail('INVALID_STATIC_PACKAGE', 'static package bytes differ from authenticated State 2');
  }
  const retainedAssets = {};
  for (const [artifactVersion, artifact] of Object.entries(manifest.artifacts ?? {})) {
    if (artifactVersion === `v${version}`) continue;
    if (
      typeof artifact?.filename !== 'string' ||
      !/^widget\.v\d+\.\d+\.\d+\.js$/.test(artifact.filename) ||
      !/^[0-9a-f]{64}$/.test(artifact.sha256 ?? '')
    ) {
      fail('INVALID_STATIC_PACKAGE', 'retained artifact identity is invalid');
    }
    retainedAssets[artifact.filename] = artifact.sha256;
  }
  return {
    protocol: PROTOCOL,
    aliasFilenames: aliases,
    exactFilename,
    manifestSha256,
    origin,
    planIdentity: match(bundle.finalPlan.planIdentity, IDENTITY, 'planIdentity'),
    retainedAssets,
    targetSha: match(bundle.finalPlan.targetSha, SHA, 'targetSha'),
    version,
    widgetSha256,
  };
}

async function inspectAuthoritative(client, origin, observe = collectRecoveryIdentity) {
  const deployment = client.inspectStatus();
  if (deployment.status !== 'succeeded' || !deployment.value) {
    fail('PRODUCTION_INSPECTION_FAILED', 'current deployment status is unavailable');
  }
  const version = client.inspectVersion(deployment.value.versionId);
  if (version.status !== 'succeeded' || !version.value) {
    fail('PRODUCTION_INSPECTION_FAILED', 'current version identity is unavailable');
  }
  return {
    deployment: deployment.value,
    live: await observe(origin),
    version: version.value,
  };
}

export async function captureBaseline({ client, expected, observe = collectRecoveryIdentity }) {
  const current = await inspectAuthoritative(client, expected.origin, observe);
  return {
    protocol: PROTOCOL,
    status: 'baseline-captured',
    planIdentity: match(expected.planIdentity, IDENTITY, 'planIdentity'),
    target: client.target,
    environment: client.environment,
    ...current,
  };
}

function requireAuthorization(authorization, expected) {
  if (
    authorization?.status !== 'mutation-authorized' ||
    authorization.planIdentity !== expected.planIdentity
  ) {
    fail('MUTATION_NOT_AUTHORIZED', 'exact approved plan authorization is required');
  }
}

export async function deployCandidate({
  authorization,
  baseline,
  client,
  expected,
  observe = collectRecoveryIdentity,
  verify = value => pollLiveVerification({ expected: value }),
}) {
  requireAuthorization(authorization, expected);
  if (
    baseline?.status !== 'baseline-captured' ||
    baseline.planIdentity !== expected.planIdentity ||
    baseline.target !== client.target ||
    baseline.environment !== 'production'
  ) {
    fail('BASELINE_MISMATCH', 'captured baseline does not authorize this production target');
  }
  const command = client.deploy();
  let after;
  try {
    after = await inspectAuthoritative(client, expected.origin, observe);
  } catch {
    return {
      protocol: PROTOCOL,
      status: 'ambiguous-critical',
      reason: 'post-deploy-inspection-unavailable',
      commandStatus: command.status,
      mutationAttempted: true,
      planIdentity: expected.planIdentity,
    };
  }
  let verified = null;
  try {
    verified = await verify(expected);
  } catch {
    // The authoritative reconciliation below must treat absent live proof as unsafe.
  }
  const decision = reconcileDeployment({
    commandStatus: command.status,
    before: baseline.deployment,
    after: after.deployment,
    version: after.version,
    expectedBuildSha: expected.targetSha,
    live: verified
      ? {
          assetVerified: true,
          buildSha: verified.targetSha,
          sourceVerified: true,
        }
      : null,
  });
  return {
    protocol: PROTOCOL,
    ...decision,
    after,
    commandStatus: command.status,
    mutationAttempted: true,
    planIdentity: expected.planIdentity,
    ...(verified ? { liveVerification: verified } : {}),
  };
}

export async function publishCandidate({ authorization, bundle: rawBundle, adapter }) {
  const bundle = hydratedBundle(rawBundle);
  const expected = validatePublicationBundle(bundle);
  requireAuthorization(authorization, {
    planIdentity: expected.planIdentity,
  });
  return { protocol: PROTOCOL, ...(await executePublication({ adapter, bundle })) };
}

export async function inspectPublication({ bundle: rawBundle, adapter }) {
  const bundle = hydratedBundle(rawBundle);
  const expected = validatePublicationBundle(bundle);
  let observation;
  try {
    observation = await adapter.inspect(expected.tag);
  } catch {
    return {
      protocol: PROTOCOL,
      status: 'unknown-critical',
      reason: 'publication-inspection-failed',
      planIdentity: expected.planIdentity,
    };
  }
  const state = classifyPublicationState(expected, observation);
  return {
    protocol: PROTOCOL,
    ...state,
    status: state.status === 'exact-published' ? 'already-published' : state.status,
    planIdentity: expected.planIdentity,
  };
}

function rollbackProof(baseline, current) {
  return verifyRollback({
    baseline: {
      assetIdentity: baseline.live.assetIdentity,
      scriptEtag: baseline.version.scriptEtag,
      sourceIdentity: baseline.live.sourceIdentity,
      versionId: baseline.deployment.versionId,
    },
    after: current.deployment,
    version: current.version,
    live: current.live,
  });
}

export async function finalizeRelease({
  baseline,
  client,
  deployment,
  expected,
  publication,
  observe = collectRecoveryIdentity,
  verify = value => pollLiveVerification({ expected: value }),
}) {
  if (deployment?.mutationAttempted !== true) {
    return { protocol: PROTOCOL, status: 'no-mutation', rollbackAttempted: false };
  }
  let current;
  try {
    current = await inspectAuthoritative(client, expected.origin, observe);
  } catch {
    return {
      protocol: PROTOCOL,
      status: 'manual-recovery-required',
      reason: 'final-inspection-unavailable',
      rollbackAttempted: false,
    };
  }
  const published = ['published', 'already-published'].includes(publication?.status);
  if (published) {
    try {
      await verify(expected);
    } catch {
      return {
        protocol: PROTOCOL,
        status: 'manual-recovery-required',
        reason: 'published-release-live-identity-mismatch',
        rollbackAttempted: false,
      };
    }
    if (
      current.version.buildSha === expected.targetSha &&
      publication.planIdentity === expected.planIdentity
    ) {
      return { protocol: PROTOCOL, status: 'published-stable', rollbackAttempted: false };
    }
    return {
      protocol: PROTOCOL,
      status: 'manual-recovery-required',
      reason: 'published-release-authority-mismatch',
      rollbackAttempted: false,
    };
  }
  const alreadyRestored = rollbackProof(baseline, current);
  if (alreadyRestored.status === 'verified') {
    return { protocol: PROTOCOL, status: 'baseline-restored', rollbackAttempted: false };
  }
  let candidateVerified = false;
  try {
    await verify(expected);
    candidateVerified = current.version.buildSha === expected.targetSha;
  } catch {
    candidateVerified = false;
  }
  if (!candidateVerified) {
    return {
      protocol: PROTOCOL,
      status: 'manual-recovery-required',
      reason: 'unexpected-active-state',
      rollbackAttempted: false,
    };
  }
  const command = client.rollback(
    baseline.deployment.versionId,
    `restore baseline ${expected.planIdentity.slice(7, 19)}`
  );
  let restored;
  try {
    restored = await inspectAuthoritative(client, expected.origin, observe);
  } catch {
    return {
      protocol: PROTOCOL,
      status: 'manual-recovery-required',
      reason: 'rollback-inspection-unavailable',
      rollbackAttempted: true,
      commandStatus: command.status,
    };
  }
  const proof = rollbackProof(baseline, restored);
  return proof.status === 'verified'
    ? {
        protocol: PROTOCOL,
        status: 'rollback-verified',
        rollbackAttempted: true,
        commandStatus: command.status,
      }
    : {
        protocol: PROTOCOL,
        status: 'manual-recovery-required',
        reason: 'rollback-identity-mismatch',
        rollbackAttempted: true,
        commandStatus: command.status,
        fields: proof.fields,
      };
}

async function jsonFile(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function cloudflareClient(input) {
  return createProductionCloudflareClient({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    controllerRoot: resolve(input.controllerRoot),
    candidateRoot: resolve(input.candidateRoot),
    controllerConfig: resolve(input.controllerConfig),
    candidateEntrypoint: resolve(input.candidateEntrypoint),
    candidateAssets: resolve(input.candidateAssets),
    controllerConfigBytes: await readFile(resolve(input.controllerConfig)),
    controllerLockBytes: await readFile(resolve(input.controllerLock)),
    targetSha: input.targetSha,
  });
}

async function runCli() {
  const [mode, inputPath] = process.argv.slice(2);
  if (!inputPath) fail('INVALID_CLI', 'usage: live-release.mjs MODE INPUT.json');
  const input = await jsonFile(inputPath);
  let output;
  if (mode === 'expected') {
    output = await buildExpectedLive({
      bundle: await jsonFile(input.bundlePath),
      origin: input.origin,
      staticPackageDir: input.staticPackageDir,
    });
  } else if (mode === 'baseline') {
    output = await captureBaseline({
      client: await cloudflareClient(input),
      expected: await jsonFile(input.expectedPath),
    });
  } else if (mode === 'deploy') {
    output = await deployCandidate({
      authorization: await jsonFile(input.authorizationPath),
      baseline: await jsonFile(input.baselinePath),
      client: await cloudflareClient(input),
      expected: await jsonFile(input.expectedPath),
    });
  } else if (mode === 'publish') {
    const bundle = await jsonFile(input.bundlePath);
    output = await publishCandidate({
      authorization: await jsonFile(input.authorizationPath),
      bundle,
      adapter: createGithubPublicationAdapter({
        repository: input.repository,
        token: process.env.BUGDROP_GITHUB_TOKEN,
      }),
    });
  } else if (mode === 'finalize') {
    const bundle = await jsonFile(input.bundlePath);
    const publication = await inspectPublication({
      bundle,
      adapter: createGithubPublicationAdapter({
        repository: input.repository,
        token: process.env.BUGDROP_GITHUB_TOKEN,
      }),
    });
    output = await finalizeRelease({
      baseline: await jsonFile(input.baselinePath),
      client: await cloudflareClient(input),
      deployment: await jsonFile(input.deploymentPath),
      expected: await jsonFile(input.expectedPath),
      publication,
    });
  } else {
    fail('INVALID_CLI', `unsupported mode ${mode ?? '<missing>'}`);
  }
  process.stdout.write(`${canonicalize(output)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
