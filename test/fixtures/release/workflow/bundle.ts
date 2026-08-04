import { createHash } from 'node:crypto';

import { canonicalize } from '../../../../scripts/release/canonical-json.mjs';
import {
  buildFinalPlan,
  buildReleaseContent,
  buildReleaseInventory,
  buildRequestPlan,
  normalizeDispatch,
} from '../../../../scripts/release/plan.mjs';

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const SHA = { target: 'a'.repeat(40), controller: 'b'.repeat(40), main: 'c'.repeat(40) };

export function workflowContext(dryRun = true) {
  return {
    eventName: 'workflow_dispatch',
    ref: 'refs/heads/main',
    workflowSha: SHA.controller,
    candidateReachableFromMain: true,
    dispatch: {
      repository: 'mean-weasel/bugdrop',
      workflowRef: '.github/workflows/deploy.yml@refs/heads/main',
      targetSha: SHA.target,
      controllerSha: SHA.controller,
      bump: 'patch',
      releaseReason: 'standard',
      rationale: '',
      operatorNotes: '',
      dryRun,
    },
  };
}

export function workflowBundle() {
  const inventory = buildReleaseInventory({
    compareUrl: 'https://github.test/compare/v1.55.0...target',
    pullRequests: [],
    commits: [{ sha: SHA.target, subject: 'Ship guarded workflow' }],
    changedPaths: ['src/index.ts'],
  });
  const requestPlan = buildRequestPlan({
    dispatch: normalizeDispatch(workflowContext(false).dispatch),
    previousTag: 'v1.55.0',
    nextTag: 'v1.55.1',
    generatedNotes: inventory.generatedNotes,
    controllerSha: SHA.controller,
    remoteMainSha: SHA.main,
    inventory,
    attestation: {
      previousReleaseSha: 'd'.repeat(40),
      candidateCommitTimestamp: '2026-08-03T00:00:00Z',
      candidateBehindMainBy: 0,
      expectedAliases: ['widget.js', 'widget.v1.js', 'widget.v1.55.js'],
      expectedAssetNames: ['widget.v1.55.1.js', 'versions.json'],
      verificationCommands: ['npm test'],
    },
  });
  const widget = Buffer.from('guarded workflow widget');
  const versions = Buffer.from(
    JSON.stringify({
      authoritative: true,
      mode: 'release',
      current: '1.55.1',
      versions: {
        v1: 'widget.v1.js',
        'v1.55': 'widget.v1.55.js',
        'v1.55.1': 'widget.v1.55.1.js',
      },
      artifacts: {
        'v1.55.1': { filename: 'widget.v1.55.1.js', sha256: sha256(widget) },
      },
    })
  );
  const releaseContent = buildReleaseContent({
    requestPlan,
    artifactHashes: {
      'widget.v1.55.1.js': sha256(widget),
      'versions.json': sha256(versions),
    },
    sourceDigests: { worker: 'e'.repeat(64), lockfile: 'f'.repeat(64) },
    toolchain: { esbuild: '0.28.0', wrangler: '4.98.0' },
    deploymentConfigDigest: '1'.repeat(64),
    verification: { contract: 'release-verification/v1', result: 'passed' },
  });
  const finalPlan = buildFinalPlan({ requestPlan, releaseContent });
  const assets: Record<string, Buffer> = {
    'widget.v1.55.1.js': widget,
    'versions.json': versions,
    'request-plan.json': Buffer.from(`${canonicalize(requestPlan)}\n`),
    'release-content.json': Buffer.from(`${canonicalize(releaseContent)}\n`),
    'final-release-plan.json': Buffer.from(`${canonicalize(finalPlan)}\n`),
  };
  const checksums = Object.entries(assets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
    .join('\n');
  assets['checksums.sha256'] = Buffer.from(`${checksums}\n`);
  return { requestPlan, releaseContent, finalPlan, assets };
}

export function artifactFor(bundle = workflowBundle()) {
  return {
    artifactId: 'artifact-123',
    available: true,
    contentIdentity: bundle.releaseContent.contentIdentity,
    planIdentity: bundle.finalPlan.planIdentity,
    requestIdentity: bundle.requestPlan.requestIdentity,
    verifiedAssetNames: bundle.finalPlan.requiredAssets,
  };
}
