#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalHash, canonicalize } from './canonical-json.mjs';
import { reconcileDeployment, verifyRollback } from './cloudflare-adapter.mjs';
import { createPreviewCloudflareClient } from './cloudflare-client.mjs';

const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_BYTES = 16 * 1024 * 1024;

class CapabilityError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, name: 'CapabilityError' });
  }
}

const fail = (code, message) => {
  throw new CapabilityError(code, message);
};
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = milliseconds =>
  new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));

function requireMatch(value, pattern, field) {
  if (!pattern.test(value ?? '')) fail('INVALID_INPUT', `${field} is invalid`);
  return value;
}

function requireResult(result, field) {
  if (result?.status !== 'succeeded' || !result.value) {
    fail('INSPECTION_FAILED', `${field} did not return authoritative state`);
  }
  return result.value;
}

function failureCode(error, fallback = 'CAPABILITY_DRILL_FAILED') {
  return /^[A-Z0-9_]{1,64}$/.test(error?.code ?? '') ? error.code : fallback;
}

async function fetchBytes(url, limit = MAX_BYTES) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok)
    fail('LIVE_FETCH_FAILED', `${new URL(url).pathname} returned ${response.status}`);
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > limit) fail('LIVE_RESPONSE_OVERSIZE', `${new URL(url).pathname} is oversized`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > limit) {
    fail('LIVE_RESPONSE_OVERSIZE', `${new URL(url).pathname} is empty or oversized`);
  }
  return bytes;
}

async function snapshot(origin, filenames = []) {
  const healthBytes = await fetchBytes(`${origin}/api/health`, 64 * 1024);
  const manifestBytes = await fetchBytes(`${origin}/versions.json`, 1024 * 1024);
  let health;
  let manifest;
  try {
    health = JSON.parse(healthBytes.toString('utf8'));
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch {
    fail('LIVE_JSON_INVALID', 'health or manifest is not JSON');
  }
  const assetHashes = { 'versions.json': digest(manifestBytes) };
  for (const filename of [...new Set(['widget.js', ...filenames])]) {
    assetHashes[filename] = digest(await fetchBytes(`${origin}/${filename}`));
  }
  return { health, manifest, assetHashes };
}

function assetIdentity(value) {
  return canonicalHash({
    manifest: value.assetHashes['versions.json'],
    widget: value.assetHashes['widget.js'],
  });
}

function verifyReleaseSnapshot(value, expected) {
  if (
    value.health?.status !== 'ok' ||
    value.health?.environment !== 'preview' ||
    value.health?.buildSha !== expected.sha ||
    value.manifest?.authoritative !== true ||
    value.manifest?.mode !== 'release' ||
    value.manifest?.current !== expected.version
  ) {
    fail(
      'LIVE_IDENTITY_MISMATCH',
      `preview does not identify capability release ${expected.version}`
    );
  }
  for (const name of expected.currentNames) {
    if (value.assetHashes[name] !== expected.currentHash) {
      fail('LIVE_ASSET_MISMATCH', `${name} differs from capability release ${expected.version}`);
    }
  }
  for (const [name, hash] of Object.entries(expected.retained)) {
    if (value.assetHashes[name] !== hash)
      fail('LIVE_RETENTION_MISMATCH', `${name} was not retained`);
  }
  return {
    assetIdentity: assetIdentity(value),
    buildSha: value.health.buildSha,
    sourceIdentity: value.health.buildSha,
  };
}

async function waitForRelease(origin, expected) {
  const filenames = [...expected.currentNames, ...Object.keys(expected.retained)];
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const value = await snapshot(origin, filenames);
      return { value, identity: verifyReleaseSnapshot(value, expected) };
    } catch (error) {
      lastError = error;
      await pause(2_000);
    }
  }
  throw lastError ?? new CapabilityError('LIVE_TIMEOUT', 'preview did not converge');
}

async function inspect(client) {
  const deployment = requireResult(client.inspectStatus(), 'deployment status');
  const version = requireResult(client.inspectVersion(deployment.versionId), 'version view');
  return { deployment, version };
}

function client(input, candidateRoot, assets, sha, createClient) {
  return createClient({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    controllerRoot: resolve(input.controllerRoot),
    candidateRoot: resolve(candidateRoot),
    controllerConfig: resolve(input.controllerConfig),
    candidateEntrypoint: resolve(candidateRoot, 'src/index.ts'),
    candidateAssets: resolve(assets),
    controllerConfigBytes: input.controllerConfigBytes,
    controllerLockBytes: input.controllerLockBytes,
    targetSha: sha,
  });
}

async function expectedRelease(root, version, sha, retained = {}) {
  const [major, minor] = version.split('.');
  const exact = `widget.v${version}.js`;
  return {
    version,
    sha,
    currentHash: digest(await readFile(resolve(root, exact))),
    currentNames: ['widget.js', `widget.v${major}.js`, `widget.v${major}.${minor}.js`, exact],
    retained,
  };
}

async function restoreBaseline({ baseline, baselineSnapshot, clientA, origin }) {
  const command = clientA.rollback(
    baseline.deployment.versionId,
    'restore preview capability baseline'
  );
  let last;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const observed = await inspect(clientA);
      const live = await snapshot(origin);
      last = verifyRollback({
        baseline: {
          versionId: baseline.deployment.versionId,
          scriptEtag: baseline.version.scriptEtag,
          sourceIdentity: baselineSnapshot.health.buildSha,
          assetIdentity: assetIdentity(baselineSnapshot),
        },
        after: observed.deployment,
        version: observed.version,
        live: {
          sourceIdentity: live.health?.buildSha,
          assetIdentity: assetIdentity(live),
        },
      });
      if (last.status === 'verified') return { commandStatus: command.status, verification: last };
    } catch (error) {
      last = { status: 'inspection-error', code: error?.code ?? 'UNKNOWN' };
    }
    await pause(2_000);
  }
  fail('BASELINE_RESTORE_FAILED', canonicalize(last));
}

export async function runCapabilityDrill(raw, dependencies = {}) {
  const input = {
    ...raw,
    shaA: requireMatch(raw.shaA, SHA, 'shaA'),
    shaB: requireMatch(raw.shaB, SHA, 'shaB'),
    versionA: requireMatch(raw.versionA, VERSION, 'versionA'),
    versionB: requireMatch(raw.versionB, VERSION, 'versionB'),
    origin: new URL(raw.origin).origin,
    controllerConfigBytes: await readFile(resolve(raw.controllerConfig)),
    controllerLockBytes: await readFile(resolve(raw.controllerLock)),
  };
  if (input.origin !== raw.origin || input.shaA === input.shaB)
    fail('INVALID_INPUT', 'origin or SHAs are unsafe');
  const createClient = dependencies.createClient ?? createPreviewCloudflareClient;
  const takeSnapshot = dependencies.snapshot ?? snapshot;
  const waitRelease = dependencies.waitForRelease ?? waitForRelease;
  const restore = dependencies.restoreBaseline ?? restoreBaseline;
  const clientA = client(input, input.candidateARoot, input.assetsA, input.shaA, createClient);
  const clientB = client(input, input.candidateBRoot, input.assetsB, input.shaB, createClient);
  const expectedA = await expectedRelease(input.assetsA, input.versionA, input.shaA);
  const retainedName = `widget.v${input.versionA}.js`;
  const expectedB = await expectedRelease(input.assetsB, input.versionB, input.shaB, {
    [retainedName]: expectedA.currentHash,
  });
  const baseline = await inspect(clientA);
  const deploymentList = requireResult(clientA.inspectDeployments(), 'deployment list');
  const versionList = requireResult(clientA.inspectVersions(), 'version list');
  if (
    !deploymentList.some(item => item.deploymentId === baseline.deployment.deploymentId) ||
    !versionList.some(item => item.versionId === baseline.version.versionId)
  ) {
    fail('LIST_CAPABILITY_MISMATCH', 'list commands do not contain the active preview identities');
  }
  const baselineSnapshot = await takeSnapshot(input.origin);
  if (baseline.version.buildSha !== baselineSnapshot.health?.buildSha) {
    fail('BASELINE_IDENTITY_MISMATCH', 'preview metadata and live health disagree before mutation');
  }
  let mutated = false;
  const evidence = {
    schema: 'bugdrop.cloudflare-capability-proof/v1',
    wranglerVersion: clientA.wranglerVersion,
    listProof: { deployments: deploymentList.length, versions: versionList.length },
    baseline: {
      versionId: baseline.deployment.versionId,
      buildSha: baseline.version.buildSha,
      assetIdentity: assetIdentity(baselineSnapshot),
    },
  };
  let drillError;
  try {
    const deployA = clientA.deploy();
    mutated = true;
    const observedA = await inspect(clientA);
    const liveA = await waitRelease(input.origin, expectedA);
    const reconcileA = reconcileDeployment({
      commandStatus: deployA.status,
      before: baseline.deployment,
      after: observedA.deployment,
      version: observedA.version,
      expectedBuildSha: input.shaA,
      live: { ...liveA.identity, sourceVerified: true, assetVerified: true },
    });
    if (reconcileA.status !== 'candidate-active')
      fail('A_RECONCILE_FAILED', canonicalize(reconcileA));

    clientB.deploy();
    const observedB = await inspect(clientB);
    const liveB = await waitRelease(input.origin, expectedB);
    const lostResponse = reconcileDeployment({
      commandStatus: 'unknown',
      before: observedA.deployment,
      after: observedB.deployment,
      version: observedB.version,
      expectedBuildSha: input.shaB,
      live: { ...liveB.identity, sourceVerified: true, assetVerified: true },
    });
    if (lostResponse.status !== 'candidate-active')
      fail('B_RECONCILE_FAILED', canonicalize(lostResponse));

    clientB.rollback(observedA.deployment.versionId, 'verify preview release rollback');
    const rolledBack = await inspect(clientA);
    const rolledBackLive = await waitRelease(input.origin, expectedA);
    const rollbackProof = verifyRollback({
      baseline: {
        versionId: observedA.deployment.versionId,
        scriptEtag: observedA.version.scriptEtag,
        sourceIdentity: liveA.identity.sourceIdentity,
        assetIdentity: liveA.identity.assetIdentity,
      },
      after: rolledBack.deployment,
      version: rolledBack.version,
      live: rolledBackLive.identity,
    });
    if (rollbackProof.status !== 'verified') fail('ROLLBACK_FAILED', canonicalize(rollbackProof));
    Object.assign(evidence, {
      releaseA: {
        versionId: observedA.deployment.versionId,
        buildSha: input.shaA,
        assetIdentity: liveA.identity.assetIdentity,
      },
      releaseB: {
        versionId: observedB.deployment.versionId,
        buildSha: input.shaB,
        assetIdentity: liveB.identity.assetIdentity,
        retained: retainedName,
      },
      lostResponse,
      rollbackProof,
    });
  } catch (error) {
    drillError = error;
    evidence.failure = { code: failureCode(error) };
  } finally {
    if (mutated) {
      try {
        evidence.restoration = await restore({
          baseline,
          baselineSnapshot,
          clientA,
          origin: input.origin,
        });
      } catch (error) {
        evidence.restoration = { status: 'failed', code: failureCode(error, 'RESTORATION_FAILED') };
        drillError = error;
      }
    }
  }
  if (drillError) {
    const error =
      drillError instanceof Error
        ? drillError
        : new CapabilityError('CAPABILITY_DRILL_FAILED', 'capability drill failed');
    error.capabilityEvidence = evidence;
    throw error;
  }
  return evidence;
}

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath)
    fail('INVALID_CLI', 'usage: capability-drill INPUT.json OUTPUT.json');
  try {
    const evidence = await runCapabilityDrill(
      JSON.parse(await readFile(resolve(inputPath), 'utf8'))
    );
    await writeFile(resolve(outputPath), `${canonicalize(evidence)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error?.capabilityEvidence) {
      await writeFile(resolve(outputPath), `${canonicalize(error.capabilityEvidence)}\n`, {
        flag: 'wx',
      });
    }
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
