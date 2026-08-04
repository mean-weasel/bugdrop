import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildExpectedLive,
  captureBaseline,
  deployCandidate,
  finalizeRelease,
  inspectPublication,
} from '../../scripts/release/live-release.mjs';
import { validatePublicationBundle } from '../../scripts/release/publication.mjs';
import { workflowBundle } from '../fixtures/release/workflow/bundle';

const SHA = 'a'.repeat(40);
const PLAN = `sha256:${'b'.repeat(64)}`;
const expected = {
  origin: 'https://bugdrop.example',
  planIdentity: PLAN,
  targetSha: SHA,
};
const authorization = { status: 'mutation-authorized', planIdentity: PLAN };

function state(name: string, buildSha: string | null) {
  return {
    deployment: {
      deploymentId: `deployment-${name}`,
      versionId: `version-${name}`,
      createdOn: '2026-08-03T12:00:00Z',
      source: 'wrangler',
      strategy: 'percentage',
    },
    version: {
      versionId: `version-${name}`,
      createdOn: '2026-08-03T12:00:00Z',
      source: 'wrangler',
      scriptEtag: `etag-${name}`,
      buildSha,
      assets: { rawRunWorkerFirst: true, serveDirectly: false },
    },
    live: {
      sourceIdentity: `sha256:${name === 'baseline' ? '1' : '2'}`.padEnd(
        71,
        name === 'baseline' ? '1' : '2'
      ),
      assetIdentity: `sha256:${name === 'baseline' ? '3' : '4'}`.padEnd(
        71,
        name === 'baseline' ? '3' : '4'
      ),
      buildSha,
    },
  };
}

function client(initial = state('baseline', null)) {
  let current = initial;
  const baseline = initial;
  const candidate = state('candidate', SHA);
  const api = {
    target: 'bugdrop',
    environment: 'production',
    inspectStatus: vi.fn(() => ({ status: 'succeeded', value: current.deployment })),
    inspectVersion: vi.fn(() => ({ status: 'succeeded', value: current.version })),
    deploy: vi.fn(() => {
      current = candidate;
      return { status: 'unknown' };
    }),
    rollback: vi.fn(() => {
      current = baseline;
      return { status: 'unknown' };
    }),
    observe: vi.fn(async () => current.live),
  };
  return api;
}

describe('live release production orchestration', () => {
  it('derives reusable live-test identity from authenticated State 2 bytes', async () => {
    const bundle = workflowBundle();
    const directory = mkdtempSync(join(tmpdir(), 'bugdrop-live-release-'));
    writeFileSync(join(directory, 'widget.v1.55.1.js'), bundle.assets['widget.v1.55.1.js']);
    writeFileSync(join(directory, 'versions.json'), bundle.assets['versions.json']);
    await expect(
      buildExpectedLive({
        bundle,
        origin: 'https://bugdrop.example',
        staticPackageDir: directory,
      })
    ).resolves.toMatchObject({
      aliasFilenames: ['widget.js', 'widget.v1.js', 'widget.v1.55.js'],
      exactFilename: 'widget.v1.55.1.js',
      planIdentity: bundle.finalPlan.planIdentity,
      retainedAssets: {},
      targetSha: SHA,
      version: '1.55.1',
    });
  });

  it('captures the exact authoritative baseline before mutation', async () => {
    const cloudflare = client();
    await expect(
      captureBaseline({ client: cloudflare, expected, observe: cloudflare.observe })
    ).resolves.toMatchObject({
      status: 'baseline-captured',
      planIdentity: PLAN,
      deployment: { versionId: 'version-baseline' },
      version: { scriptEtag: 'etag-baseline' },
    });
  });

  it('authoritatively reinspects publication before finalization', async () => {
    const bundle = workflowBundle();
    const publication = validatePublicationBundle(bundle);
    const adapter = {
      inspect: vi.fn(async () => ({
        complete: true,
        tagRef: { objectSha: 'c'.repeat(40) },
        tagObject: {
          annotation: publication.tagAnnotation,
          kind: 'annotated',
          objectSha: 'c'.repeat(40),
          targetSha: publication.targetSha,
          targetType: 'commit',
        },
        releases: [
          {
            assets: Object.entries(bundle.assets).map(([name, bytes]) => ({ name, bytes })),
            body: publication.body,
            bodyMarker: publication.bodyMarker,
            draft: false,
            id: '123',
            marker: publication.marker,
            prerelease: false,
            published: true,
            tag: publication.tag,
            targetSha: publication.targetSha,
          },
        ],
      })),
    };
    await expect(inspectPublication({ bundle, adapter })).resolves.toMatchObject({
      status: 'already-published',
      planIdentity: bundle.finalPlan.planIdentity,
    });
  });

  it('reconciles a lost deploy response only after source and asset live proof', async () => {
    const cloudflare = client();
    const baseline = await captureBaseline({
      client: cloudflare,
      expected,
      observe: cloudflare.observe,
    });
    await expect(
      deployCandidate({
        authorization,
        baseline,
        client: cloudflare,
        expected,
        observe: cloudflare.observe,
        verify: async () => ({ status: 'verified', targetSha: SHA }),
      })
    ).resolves.toMatchObject({
      status: 'candidate-active',
      commandStatus: 'unknown',
      mutationAttempted: true,
    });
  });

  it('retries a transient authoritative inspection after the deploy command succeeds', async () => {
    const cloudflare = client();
    const baseline = await captureBaseline({
      client: cloudflare,
      expected,
      observe: cloudflare.observe,
    });
    cloudflare.inspectStatus.mockImplementationOnce(() => ({ status: 'failed' }));
    const sleep = vi.fn(async () => {});

    await expect(
      deployCandidate({
        authorization,
        baseline,
        client: cloudflare,
        expected,
        inspectionAttempts: 2,
        inspectionIntervalMs: 1,
        observe: cloudflare.observe,
        sleep,
        verify: async () => ({ status: 'verified', targetSha: SHA }),
      })
    ).resolves.toMatchObject({ status: 'candidate-active' });
    expect(sleep).toHaveBeenCalledOnce();
    expect(cloudflare.inspectStatus).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid inspection retry options before production mutation', async () => {
    const cloudflare = client();
    const baseline = await captureBaseline({
      client: cloudflare,
      expected,
      observe: cloudflare.observe,
    });

    await expect(
      deployCandidate({
        authorization,
        baseline,
        client: cloudflare,
        expected,
        inspectionAttempts: 0,
        observe: cloudflare.observe,
      })
    ).rejects.toMatchObject({ code: 'INVALID_LIVE_RELEASE_INPUT' });
    expect(cloudflare.deploy).not.toHaveBeenCalled();
  });

  it('does not accept a candidate deployment when bounded live proof fails', async () => {
    const cloudflare = client();
    const baseline = await captureBaseline({
      client: cloudflare,
      expected,
      observe: cloudflare.observe,
    });
    await expect(
      deployCandidate({
        authorization,
        baseline,
        client: cloudflare,
        expected,
        observe: cloudflare.observe,
        verify: async () => {
          throw new Error('asset mismatch');
        },
      })
    ).resolves.toMatchObject({ status: 'ambiguous-critical' });
  });

  it('rolls an unpublished candidate back to the captured version and proves assets', async () => {
    const cloudflare = client();
    const baseline = await captureBaseline({
      client: cloudflare,
      expected,
      observe: cloudflare.observe,
    });
    const deployment = await deployCandidate({
      authorization,
      baseline,
      client: cloudflare,
      expected,
      observe: cloudflare.observe,
      verify: async () => ({ status: 'verified', targetSha: SHA }),
    });
    await expect(
      finalizeRelease({
        baseline,
        client: cloudflare,
        deployment,
        expected,
        publication: { status: 'unknown-critical' },
        observe: cloudflare.observe,
        verify: async () => ({ status: 'verified', targetSha: SHA }),
      })
    ).resolves.toMatchObject({
      status: 'rollback-verified',
      rollbackAttempted: true,
      commandStatus: 'unknown',
    });
    expect(cloudflare.rollback).toHaveBeenCalledWith(
      'version-baseline',
      expect.stringContaining('restore baseline')
    );
  });

  it('never rolls back an unexpected active state', async () => {
    const cloudflare = client(state('intruder', 'c'.repeat(40)));
    const baseline = {
      protocol: 'bugdrop.live-release/v1',
      status: 'baseline-captured',
      planIdentity: PLAN,
      target: 'bugdrop',
      environment: 'production',
      ...state('baseline', null),
    };
    await expect(
      finalizeRelease({
        baseline,
        client: cloudflare,
        deployment: { mutationAttempted: true },
        expected,
        publication: { status: 'not-attempted' },
        observe: cloudflare.observe,
        verify: async () => {
          throw new Error('not candidate');
        },
      })
    ).resolves.toMatchObject({
      status: 'manual-recovery-required',
      reason: 'unexpected-active-state',
      rollbackAttempted: false,
    });
    expect(cloudflare.rollback).not.toHaveBeenCalled();
  });
});
