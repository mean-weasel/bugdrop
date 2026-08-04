import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCapabilityDrill } from '../../scripts/release/cloudflare-capability-drill.mjs';

const SHA_A = '1'.repeat(40);
const SHA_B = '2'.repeat(40);
const SHA_BASELINE = '0'.repeat(40);
const VERSION_A = '9000.0.0';
const VERSION_B = '9000.0.1';
const BASELINE_SNAPSHOT = {
  health: { buildSha: SHA_BASELINE },
  assetHashes: { 'versions.json': 'manifest-baseline', 'widget.js': 'widget-baseline' },
};

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true })));
});

function deployment(versionId: string) {
  return {
    deploymentId: `deployment-${versionId}`,
    versionId,
    createdOn: '2026-08-04T12:00:00Z',
    source: 'wrangler',
    strategy: 'percentage',
  };
}

function version(versionId: string, buildSha: string) {
  return {
    versionId,
    buildSha,
    scriptEtag: `etag-${versionId}`,
    createdOn: '2026-08-04T12:00:00Z',
    source: 'wrangler',
    assets: { rawRunWorkerFirst: true, serveDirectly: false },
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'bugdrop-cloudflare-drill-'));
  temporaryRoots.push(root);
  const controllerRoot = join(root, 'controller');
  const candidateARoot = join(root, 'candidate-a');
  const candidateBRoot = join(root, 'candidate-b');
  const assetsA = join(candidateARoot, 'public');
  const assetsB = join(candidateBRoot, 'public');
  await Promise.all([
    mkdir(controllerRoot),
    mkdir(assetsA, { recursive: true }),
    mkdir(assetsB, { recursive: true }),
  ]);
  const controllerConfig = join(controllerRoot, 'wrangler.toml');
  const controllerLock = join(controllerRoot, 'package-lock.json');
  await Promise.all([
    writeFile(controllerConfig, '[env.preview]\nname = "bugdrop-preview"\n'),
    writeFile(
      controllerLock,
      JSON.stringify({ packages: { 'node_modules/wrangler': { version: '4.98.0' } } })
    ),
    writeFile(join(assetsA, `widget.v${VERSION_A}.js`), 'candidate-a'),
    writeFile(join(assetsB, `widget.v${VERSION_B}.js`), 'candidate-b'),
  ]);

  const statusA = [deployment('baseline'), deployment('candidate-a'), deployment('candidate-a')];
  const statusB = [deployment('candidate-b')];
  const createClient = vi.fn(input => {
    const statuses = input.targetSha === SHA_A ? statusA : statusB;
    return {
      wranglerVersion: '4.98.0',
      inspectStatus: vi.fn(() => ({ status: 'succeeded', value: statuses.shift() })),
      inspectVersion: vi.fn((versionId: string) => ({
        status: 'succeeded',
        value: version(
          versionId,
          versionId === 'baseline' ? SHA_BASELINE : versionId === 'candidate-a' ? SHA_A : SHA_B
        ),
      })),
      inspectDeployments: vi.fn(() => ({
        status: 'succeeded',
        value: [deployment('baseline')],
      })),
      inspectVersions: vi.fn(() => ({
        status: 'succeeded',
        value: [version('baseline', SHA_BASELINE)],
      })),
      deploy: vi.fn(() => ({ status: 'succeeded' })),
      rollback: vi.fn(() => ({ status: 'succeeded' })),
    };
  });
  const input = {
    controllerRoot,
    controllerConfig,
    controllerLock,
    candidateARoot,
    candidateBRoot,
    assetsA,
    assetsB,
    shaA: SHA_A,
    shaB: SHA_B,
    versionA: VERSION_A,
    versionB: VERSION_B,
    origin: 'https://preview.example',
  };
  return { createClient, input };
}

describe('Cloudflare capability drill', () => {
  it('proves lost-response reconciliation, rollback, and final restoration', async () => {
    const { createClient, input } = await fixture();
    const restoreBaseline = vi.fn(async () => ({
      commandStatus: 'succeeded',
      verification: { status: 'verified' },
    }));
    const evidence = await runCapabilityDrill(input, {
      createClient,
      snapshot: vi.fn(async () => BASELINE_SNAPSHOT),
      waitForRelease: vi.fn(async (_origin, expected) => ({
        value: {},
        identity: {
          buildSha: expected.sha,
          sourceIdentity: expected.sha,
          assetIdentity: `assets-${expected.version}`,
        },
      })),
      restoreBaseline,
    });

    expect(evidence).toMatchObject({
      schema: 'bugdrop.cloudflare-capability-proof/v1',
      lostResponse: { status: 'candidate-active', versionId: 'candidate-b' },
      rollbackProof: { status: 'verified' },
      restoration: { verification: { status: 'verified' } },
    });
    expect(restoreBaseline).toHaveBeenCalledOnce();
  });

  it('restores the baseline when live verification fails after mutation', async () => {
    const { createClient, input } = await fixture();
    const restoreBaseline = vi.fn(async () => ({ verification: { status: 'verified' } }));

    let failure: Error & { capabilityEvidence?: Record<string, unknown> };
    try {
      await runCapabilityDrill(input, {
        createClient,
        snapshot: vi.fn(async () => BASELINE_SNAPSHOT),
        waitForRelease: vi.fn(async () => {
          throw new Error('preview did not converge');
        }),
        restoreBaseline,
      });
      throw new Error('expected the capability drill to fail');
    } catch (error) {
      failure = error as Error & { capabilityEvidence?: Record<string, unknown> };
    }
    expect(failure).toMatchObject({
      message: 'preview did not converge',
      capabilityEvidence: {
        baseline: { versionId: 'baseline', buildSha: SHA_BASELINE },
        failure: { code: 'CAPABILITY_DRILL_FAILED' },
        restoration: { verification: { status: 'verified' } },
      },
    });
    expect(restoreBaseline).toHaveBeenCalledOnce();
  });

  it('retains the exact baseline identity when restoration also fails', async () => {
    const { createClient, input } = await fixture();
    let failure: Error & { capabilityEvidence?: Record<string, unknown> };
    try {
      await runCapabilityDrill(input, {
        createClient,
        snapshot: vi.fn(async () => BASELINE_SNAPSHOT),
        waitForRelease: vi.fn(async () => {
          throw new Error('preview did not converge');
        }),
        restoreBaseline: vi.fn(async () => {
          throw Object.assign(new Error('restoration failed'), { code: 'BASELINE_RESTORE_FAILED' });
        }),
      });
      throw new Error('expected the capability drill to fail');
    } catch (error) {
      failure = error as Error & { capabilityEvidence?: Record<string, unknown> };
    }
    expect(failure.capabilityEvidence).toMatchObject({
      baseline: { versionId: 'baseline', buildSha: SHA_BASELINE },
      failure: { code: 'CAPABILITY_DRILL_FAILED' },
      restoration: { status: 'failed', code: 'BASELINE_RESTORE_FAILED' },
    });
  });
});
