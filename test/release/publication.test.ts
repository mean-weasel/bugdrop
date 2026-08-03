import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalHash, canonicalize } from '../../scripts/release/canonical-json.mjs';
import {
  buildFinalPlan,
  buildReleaseContent,
  buildReleaseInventory,
  buildRequestPlan,
  normalizeDispatch,
} from '../../scripts/release/plan.mjs';
import {
  PublicationError,
  classifyPublicationState,
  executePublication,
  validatePublicationBundle,
} from '../../scripts/release/publication.mjs';
import {
  clonePublicationState,
  FakeGitHubPublicationAdapter,
} from '../fixtures/release/publication/fake-github';

const SHA = { target: 'a'.repeat(40), controller: 'b'.repeat(40), main: 'c'.repeat(40) };
const conflictCases = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../fixtures/release/publication/conflict-cases.json', import.meta.url)),
    'utf8'
  )
);

function sha256(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function publicationBundle(verificationResult: 'passed' | 'failed' = 'passed') {
  const inventory = buildReleaseInventory({
    compareUrl: 'https://github.test/compare/v1.55.0...target',
    pullRequests: [],
    commits: [{ sha: SHA.target, subject: 'Ship exact release' }],
    changedPaths: ['src/index.ts'],
  });
  const requestPlan = buildRequestPlan({
    dispatch: normalizeDispatch({
      repository: 'mean-weasel/bugdrop',
      workflowRef: '.github/workflows/deploy.yml@refs/heads/main',
      targetSha: SHA.target,
      controllerSha: SHA.controller,
      bump: 'patch',
      releaseReason: 'weekly',
      rationale: '',
      operatorNotes: '',
    }),
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
      expectedAliases: ['widget.js'],
      expectedAssetNames: ['widget.v1.55.1.js'],
      verificationCommands: ['npm test'],
    },
  });
  const widget = Buffer.from('exact widget bytes');
  const releaseContent = buildReleaseContent({
    requestPlan,
    artifactHashes: { 'widget.v1.55.1.js': sha256(widget) },
    sourceDigests: { worker: 'e'.repeat(64), lockfile: 'f'.repeat(64) },
    toolchain: { esbuild: '0.28.0', wrangler: '4.98.0' },
    deploymentConfigDigest: '1'.repeat(64),
    verification: { contract: 'release-verification/v1', result: verificationResult },
  });
  const finalPlan = buildFinalPlan({ requestPlan, releaseContent });
  const assets: Record<string, Buffer> = {
    'widget.v1.55.1.js': widget,
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

async function publishedAdapter() {
  const bundle = publicationBundle();
  const adapter = new FakeGitHubPublicationAdapter();
  const result = await executePublication({ adapter, bundle });
  expect(result.status).toBe('published');
  return { adapter, bundle };
}

describe('complete publication and exact retry', () => {
  it('creates only the canonical tag, matched draft, absent assets, and explicit publish', async () => {
    const { adapter, bundle } = await publishedAdapter();
    expect(adapter.state.tagObject).toMatchObject({
      kind: 'annotated',
      targetSha: bundle.finalPlan.targetSha,
    });
    expect(adapter.applied).toEqual([
      'create-tag',
      'create-draft',
      ...bundle.finalPlan.requiredAssets.map(name => `upload-asset:${name}`),
      'publish-draft',
    ]);
    expect(adapter.log.filter(item => item === 'inspect').length).toBe(adapter.applied.length + 1);
    expect(adapter.log.join(' ')).not.toMatch(/force|move|delete|overwrite|increment/);
  });

  it('turns an exact rerun into an authenticated no-op', async () => {
    const { adapter, bundle } = await publishedAdapter();
    const before = [...adapter.applied];
    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'already-published',
      planIdentity: bundle.finalPlan.planIdentity,
    });
    expect(adapter.applied).toEqual(before);
  });

  it.each(['create-tag', 'create-draft', 'upload-asset', 'publish-draft'] as const)(
    'recovers an applied %s mutation after its response is lost',
    async point => {
      const bundle = publicationBundle();
      const adapter = new FakeGitHubPublicationAdapter({ loseAfter: [point] });
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'published',
      });
      expect(adapter.applied.filter(item => item.startsWith(point))).toHaveLength(
        point === 'upload-asset' ? bundle.finalPlan.requiredAssets.length : 1
      );
    }
  );

  it.each(['create-tag', 'create-draft', 'upload-asset', 'publish-draft'] as const)(
    'returns a safe partial after an unapplied %s response loss and resumes exactly',
    async point => {
      const bundle = publicationBundle();
      const adapter = new FakeGitHubPublicationAdapter({ loseBefore: [point] });
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'partial-resumable',
        recovery: { production: 'restore-prior-baseline', automaticGitHubCleanup: false },
      });
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'published',
      });
      expect(new Set(adapter.state.releases!.map(release => release.tag)).size).toBe(1);
      expect(new Set(adapter.state.releases![0].assets.map(asset => asset.name)).size).toBe(
        bundle.finalPlan.requiredAssets.length
      );
    }
  );
});

describe('conflicts, unknown state, and bundle authentication', () => {
  it.each(conflictCases)('fails closed without mutation for %s', async (kind: string) => {
    const { adapter, bundle } = await publishedAdapter();
    const state = clonePublicationState(adapter.state);
    if (kind === 'lightweight-tag') state.tagObject = null;
    if (kind === 'wrong-tag-target') state.tagObject!.targetSha = '9'.repeat(40);
    if (kind === 'wrong-tag-annotation') state.tagObject!.annotation = 'wrong';
    if (kind === 'tag-object-mismatch') state.tagRef!.objectSha = '8'.repeat(40);
    if (kind === 'release-without-tag') {
      state.tagRef = null;
      state.tagObject = null;
    }
    if (kind === 'duplicate-release')
      state.releases!.push(clonePublicationState(state.releases![0]));
    if (kind === 'wrong-release-marker')
      state.releases![0].marker.planIdentity = `sha256:${'9'.repeat(64)}`;
    if (kind === 'wrong-body-marker') state.releases![0].bodyMarker = 'wrong';
    if (kind === 'wrong-full-body') {
      state.releases![0].body = `Altered release notes\n\n${state.releases![0].bodyMarker}`;
    }
    if (kind === 'duplicate-asset')
      state.releases![0].assets.push(clonePublicationState(state.releases![0].assets[0]));
    if (kind === 'unexpected-asset')
      state.releases![0].assets.push({ name: 'extra.zip', bytes: Buffer.from('x') });
    if (kind === 'corrupt-asset') state.releases![0].assets[0].bytes = Buffer.from('corrupt');
    if (kind === 'published-incomplete') state.releases![0].assets.pop();
    const conflicted = new FakeGitHubPublicationAdapter({ state });
    await expect(executePublication({ adapter: conflicted, bundle })).resolves.toMatchObject({
      status: 'conflict',
      recovery: { automaticGitHubCleanup: false },
    });
    expect(conflicted.applied).toEqual([]);
  });

  it('treats incomplete or unavailable inspection as unknown-critical', async () => {
    const bundle = publicationBundle();
    await expect(
      executePublication({
        adapter: new FakeGitHubPublicationAdapter({ state: { complete: false } }),
        bundle,
      })
    ).resolves.toMatchObject({ status: 'unknown-critical' });
    await expect(
      executePublication({
        adapter: new FakeGitHubPublicationAdapter({ inspectFails: true }),
        bundle,
      })
    ).resolves.toMatchObject({ status: 'unknown-critical' });
  });

  it('fails closed when state becomes unreadable after a successful mutation', async () => {
    const bundle = publicationBundle();
    const adapter = new FakeGitHubPublicationAdapter({ failInspectAfterApplied: true });
    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      recovery: { automaticGitHubCleanup: false },
    });
    expect(adapter.applied).toEqual(['create-tag']);
  });

  it('rejects tampered plan, content, checksum, or asset bytes before inspection', () => {
    const base = publicationBundle();
    const mutators: Array<(bundle: typeof base) => void> = [
      bundle => {
        bundle.finalPlan.targetSha = '9'.repeat(40);
      },
      bundle => {
        bundle.releaseContent.artifactHashes['widget.v1.55.1.js'] = '9'.repeat(64);
      },
      bundle => {
        bundle.assets['checksums.sha256'] = Buffer.from('bad');
      },
      bundle => {
        bundle.assets['widget.v1.55.1.js'] = Buffer.from('bad');
      },
    ];
    for (const mutate of mutators) {
      const bundle = structuredClone(base);
      mutate(bundle);
      expect(() => validatePublicationBundle(bundle)).toThrow(PublicationError);
    }
    expect(() => validatePublicationBundle(publicationBundle('failed'))).toThrow(/not verified/);
  });

  it('rejects a consistently rehashed omission of an attested asset before inspection', async () => {
    const bundle = publicationBundle();
    delete bundle.assets['widget.v1.55.1.js'];
    bundle.finalPlan.requiredAssets = bundle.finalPlan.requiredAssets.filter(
      name => name !== 'widget.v1.55.1.js'
    );
    const finalPayload = { ...bundle.finalPlan };
    delete finalPayload.planIdentity;
    bundle.finalPlan.planIdentity = canonicalHash(finalPayload);
    bundle.assets['final-release-plan.json'] = Buffer.from(`${canonicalize(bundle.finalPlan)}\n`);
    const checksumInputs = Object.entries(bundle.assets).filter(
      ([name]) => name !== 'checksums.sha256'
    );
    bundle.assets['checksums.sha256'] = Buffer.from(
      `${checksumInputs
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
        .join('\n')}\n`
    );
    const adapter = new FakeGitHubPublicationAdapter();
    expect(() => validatePublicationBundle(bundle)).toThrow(/requiredAssets/);
    await expect(executePublication({ adapter, bundle })).rejects.toThrow(/requiredAssets/);
    expect(adapter.log).toEqual([]);
    expect(adapter.applied).toEqual([]);
  });

  it('classifies a tag-only state as the same-version draft continuation', () => {
    const bundle = publicationBundle();
    const expected = validatePublicationBundle(bundle);
    expect(
      classifyPublicationState(expected, {
        complete: true,
        tagRef: { objectSha: '7'.repeat(40) },
        tagObject: {
          kind: 'annotated',
          objectSha: '7'.repeat(40),
          targetType: 'commit',
          targetSha: bundle.finalPlan.targetSha,
          annotation: expected.tagAnnotation,
        },
        releases: [],
      })
    ).toMatchObject({
      status: 'partial-resumable',
      nextAction: { kind: 'create-draft', tag: 'v1.55.1' },
    });
  });
});
