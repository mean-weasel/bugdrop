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
      releaseReason: 'standard',
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

type DelayedMutation = 'create-tag' | 'create-draft' | 'upload-asset' | 'publish-draft';
type InspectionObservation = FakeGitHubPublicationAdapter['state'] | Error;

function queueMutationInspections(
  adapter: FakeGitHubPublicationAdapter,
  point: DelayedMutation,
  observations: (
    before: FakeGitHubPublicationAdapter['state'],
    after: FakeGitHubPublicationAdapter['state']
  ) => InspectionObservation[]
) {
  const method = {
    'create-tag': 'createAnnotatedTag',
    'create-draft': 'createDraft',
    'upload-asset': 'uploadAsset',
    'publish-draft': 'publishDraft',
  }[point] as 'createAnnotatedTag' | 'createDraft' | 'uploadAsset' | 'publishDraft';
  const mutate = adapter[method].bind(adapter) as (input: never) => Promise<unknown>;
  const inspect = adapter.inspect.bind(adapter);
  const inspectRelease = adapter.inspectRelease.bind(adapter);
  let queued: InspectionObservation[] = [];

  adapter[method] = (async (input: never) => {
    const before = clonePublicationState(adapter.state);
    const appliedBefore = adapter.applied.length;
    try {
      return await mutate(input);
    } finally {
      if (adapter.applied.length > appliedBefore) {
        queued = observations(before, clonePublicationState(adapter.state));
      }
    }
  }) as (typeof adapter)[typeof method];
  const queuedInspection = async (log: string, fallback: () => Promise<unknown>) => {
    const observation = queued.shift();
    if (!observation) return fallback();
    adapter.log.push(log);
    if (observation instanceof Error) throw observation;
    return clonePublicationState(observation);
  };
  adapter.inspect = async () => queuedInspection('inspect', inspect) as ReturnType<typeof inspect>;
  adapter.inspectRelease = async (releaseId: string, tag?: string) =>
    queuedInspection(`inspect-release:${releaseId}`, () =>
      inspectRelease(releaseId, tag)
    ) as ReturnType<typeof inspectRelease>;
  return adapter;
}

function delayMutationVisibility(
  adapter: FakeGitHubPublicationAdapter,
  point: DelayedMutation,
  inspections: number
) {
  const count = Number.isFinite(inspections) ? inspections : 10;
  return queueMutationInspections(adapter, point, before =>
    Array.from({ length: count }, () => clonePublicationState(before))
  );
}

async function preexistingDraftAdapter(bundle = publicationBundle()) {
  const published = new FakeGitHubPublicationAdapter();
  await expect(executePublication({ adapter: published, bundle })).resolves.toMatchObject({
    status: 'published',
  });
  const state = clonePublicationState(published.state);
  state.releases![0].draft = true;
  state.releases![0].published = false;
  return new FakeGitHubPublicationAdapter({ state });
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
    expect(adapter.log.filter(item => item.startsWith('inspect')).length).toBe(
      adapter.applied.length + 1
    );
    expect(adapter.log.filter(item => item === 'inspect-release:123')).toHaveLength(
      adapter.applied.length - 1
    );
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

  it.each(['upload-asset', 'publish-draft'] as const)(
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
      expect(adapter.log.filter(item => item.startsWith(point))).toHaveLength(
        point === 'upload-asset' ? bundle.finalPlan.requiredAssets.length : 1
      );
    }
  );

  it.each(['create-tag', 'create-draft'] as const)(
    'fails closed after an applied %s response is lost without claiming fresh ownership',
    async point => {
      const bundle = publicationBundle();
      const adapter = new FakeGitHubPublicationAdapter({ loseAfter: [point] });
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'unknown-critical',
        reason: expect.stringContaining('mutation-outcome-unobserved'),
      });
      expect(adapter.log.filter(item => item.startsWith(point))).toHaveLength(1);
      if (point === 'create-tag') expect(adapter.log).not.toContain('create-draft');
      if (point === 'create-draft') {
        expect(adapter.log.some(item => item.startsWith('upload-asset'))).toBe(false);
      }
    }
  );

  it('fails closed when a lost tag response is followed by the correct tag becoming visible', async () => {
    const bundle = publicationBundle();
    const adapter = delayMutationVisibility(
      new FakeGitHubPublicationAdapter({ loseAfter: ['create-tag'] }),
      'create-tag',
      2
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: expect.stringContaining('mutation-outcome-unobserved:create-tag'),
    });
    expect(adapter.log.filter(item => item === 'create-tag')).toHaveLength(1);
    expect(adapter.applied.filter(item => item === 'create-tag')).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(0);
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(0);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it('fails closed when an unapplied lost tag is followed by a matching tag observation', async () => {
    const bundle = publicationBundle();
    const expected = validatePublicationBundle(bundle);
    const adapter = new FakeGitHubPublicationAdapter({ loseBefore: ['create-tag'] });
    const inspect = adapter.inspect.bind(adapter);
    let inspections = 0;
    adapter.inspect = async () => {
      inspections += 1;
      if (inspections === 1) return inspect();
      adapter.log.push('inspect');
      return {
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
      };
    };

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: expect.stringContaining('mutation-outcome-unobserved:create-tag'),
    });
    expect(adapter.log.filter(item => item === 'create-tag')).toHaveLength(1);
    expect(adapter.applied.filter(item => item === 'create-tag')).toHaveLength(0);
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(0);
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(0);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it('fails closed on a mismatched tag object after one successful tag mutation', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'create-tag',
      (_before, after) => {
        const mismatch = clonePublicationState(after);
        mismatch.tagRef!.objectSha = '8'.repeat(40);
        return [mismatch];
      }
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'conflict',
      reason: 'tag-identity-mismatch',
    });
    expect(adapter.log.filter(item => item === 'create-tag')).toHaveLength(1);
    expect(adapter.applied.filter(item => item === 'create-tag')).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(0);
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(0);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it.each(['create-tag', 'create-draft', 'upload-asset', 'publish-draft'] as const)(
    'converges delayed %s visibility without repeating the mutation',
    async point => {
      const bundle = publicationBundle();
      const adapter = delayMutationVisibility(new FakeGitHubPublicationAdapter(), point, 2);
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'published',
      });
      expect(adapter.applied.filter(item => item.startsWith(point))).toHaveLength(
        point === 'upload-asset' ? bundle.finalPlan.requiredAssets.length : 1
      );
      expect(adapter.log.filter(item => item.startsWith(point))).toHaveLength(
        point === 'upload-asset' ? bundle.finalPlan.requiredAssets.length : 1
      );
    }
  );

  it.each(['upload-asset', 'publish-draft'] as const)(
    'converges a lost %s response through delayed visibility without repeating the mutation',
    async point => {
      const bundle = publicationBundle();
      const adapter = delayMutationVisibility(
        new FakeGitHubPublicationAdapter({ loseAfter: [point] }),
        point,
        2
      );
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'published',
      });
      expect(adapter.applied.filter(item => item.startsWith(point))).toHaveLength(
        point === 'upload-asset' ? bundle.finalPlan.requiredAssets.length : 1
      );
    }
  );

  it.each(['create-tag', 'create-draft', 'upload-asset', 'publish-draft'] as const)(
    'fails closed when successful %s visibility never converges',
    async point => {
      const bundle = publicationBundle();
      const adapter = delayMutationVisibility(
        new FakeGitHubPublicationAdapter(),
        point,
        Number.POSITIVE_INFINITY
      );
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'unknown-critical',
        reason: expect.stringContaining('mutation-outcome-unobserved'),
        recovery: { automaticGitHubCleanup: false },
      });
      expect(adapter.applied.filter(item => item.startsWith(point))).toHaveLength(1);
      expect(adapter.log.filter(item => item.startsWith(point))).toHaveLength(1);
      if (point === 'create-tag') {
        expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(0);
        expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(0);
        expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
      }
    }
  );

  it('fails closed when exact-ID inspection returns a different release', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'create-draft',
      (_before, after) => {
        const mismatch = clonePublicationState(after);
        mismatch.releases![0].id = '456';
        return Array.from({ length: 4 }, () => clonePublicationState(mismatch));
      }
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: expect.stringContaining('mutation-outcome-unobserved:create-draft'),
    });
    expect(adapter.log.filter(item => item === 'create-tag')).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(1);
    expect(adapter.applied.filter(item => item === 'create-draft')).toHaveLength(1);
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(0);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it('detects a duplicate appearing after draft creation before the first upload', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'create-draft',
      (_before, after) => {
        const duplicate = clonePublicationState(after.releases![0]);
        duplicate.id = '456';
        after.releases!.push(duplicate);
        return [after];
      }
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'conflict',
      reason: 'duplicate-release',
    });
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(1);
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(0);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it('detects a duplicate appearing between asset uploads before the next upload', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'upload-asset',
      (_before, after) => {
        const duplicate = clonePublicationState(after.releases![0]);
        duplicate.id = '456';
        after.releases!.push(duplicate);
        return [after];
      }
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'conflict',
      reason: 'duplicate-release',
    });
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(1);
    expect(adapter.applied.filter(item => item.startsWith('upload-asset'))).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it('detects a duplicate after the final asset before publish', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'upload-asset',
      (_before, after) => {
        if (after.releases![0].assets.length !== bundle.finalPlan.requiredAssets.length) return [];
        const duplicate = clonePublicationState(after.releases![0]);
        duplicate.id = '456';
        after.releases!.push(duplicate);
        return [after];
      }
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'conflict',
      reason: 'duplicate-release',
    });
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(
      bundle.finalPlan.requiredAssets.length
    );
    expect(adapter.applied.filter(item => item.startsWith('upload-asset'))).toHaveLength(
      bundle.finalPlan.requiredAssets.length
    );
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it('fails closed on a tag-only regression after one publish mutation', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'publish-draft',
      (_before, after) => {
        const tagOnly = clonePublicationState(after);
        tagOnly.releases = [];
        return Array.from({ length: 4 }, () => clonePublicationState(tagOnly));
      }
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: expect.stringContaining('mutation-outcome-unobserved:publish-draft'),
    });
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(1);
    expect(adapter.applied.filter(item => item === 'publish-draft')).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(1);
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(
      bundle.finalPlan.requiredAssets.length
    );
  });

  it('fails closed on an earlier-asset regression after one later upload mutation', async () => {
    const bundle = publicationBundle();
    const required = bundle.finalPlan.requiredAssets;
    const current = required[2];
    const earlier = required[1];
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'upload-asset',
      (before, after) => {
        if (before.releases![0].assets.some(asset => asset.name === current)) return [];
        if (!after.releases![0].assets.some(asset => asset.name === current)) return [];
        const regressive = clonePublicationState(after);
        regressive.releases![0].assets = regressive.releases![0].assets.filter(
          asset => asset.name !== earlier
        );
        return Array.from({ length: 4 }, () => clonePublicationState(regressive));
      }
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: expect.stringContaining(`mutation-outcome-unobserved:upload-asset:123:${current}`),
    });
    expect(adapter.log.filter(item => item === `upload-asset:${current}`)).toHaveLength(1);
    expect(adapter.applied.filter(item => item === `upload-asset:${current}`)).toHaveLength(1);
    expect(adapter.log.filter(item => item === `upload-asset:${earlier}`)).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it('does not repeat a mutation when every observation retains the same action key', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'create-draft',
      before => Array.from({ length: 4 }, () => clonePublicationState(before))
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: expect.stringContaining('mutation-outcome-unobserved:create-draft'),
    });
    expect(adapter.log.filter(item => item === 'create-tag')).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(1);
    expect(adapter.applied.filter(item => item === 'create-draft')).toHaveLength(1);
    expect(adapter.log.filter(item => item.startsWith('upload-asset'))).toHaveLength(0);
    expect(adapter.log.filter(item => item === 'publish-draft')).toHaveLength(0);
  });

  it.each(['create-tag', 'create-draft', 'upload-asset', 'publish-draft'] as const)(
    'fails closed after an unapplied %s response loss without retrying the mutation',
    async point => {
      const bundle = publicationBundle();
      const adapter = new FakeGitHubPublicationAdapter({ loseBefore: [point] });
      await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
        status: 'unknown-critical',
        reason: expect.stringContaining('mutation-outcome-unobserved'),
        recovery: { production: 'restore-prior-baseline', automaticGitHubCleanup: false },
      });
      expect(adapter.log.filter(item => item.startsWith(point))).toHaveLength(1);
      if (point === 'create-tag') {
        expect(adapter.log).not.toContain('create-draft');
        expect(adapter.applied).toEqual([]);
      }
    }
  );

  it('ignores transient inspection failures and regressions until forward state is visible', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'create-draft',
      (before, after) => [
        new Error('transient inspection failure'),
        clonePublicationState(before),
        clonePublicationState(after),
      ]
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'published',
    });
    expect(adapter.applied.filter(item => item === 'create-draft')).toHaveLength(1);
  });

  it('fails closed when transient inspection failures never yield forward state', async () => {
    const bundle = publicationBundle();
    const adapter = queueMutationInspections(
      new FakeGitHubPublicationAdapter(),
      'create-draft',
      before => [
        new Error('transient inspection failure'),
        clonePublicationState(before),
        new Error('transient inspection failure'),
        clonePublicationState(before),
      ]
    );

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: expect.stringContaining('mutation-outcome-unobserved'),
    });
    expect(adapter.applied.filter(item => item === 'create-draft')).toHaveLength(1);
    expect(adapter.log.filter(item => item === 'create-draft')).toHaveLength(1);
  });
});

describe('pre-existing publication state', () => {
  it('fails closed on an initial exact tag without mutating', async () => {
    const { adapter: published, bundle } = await publishedAdapter();
    const state = clonePublicationState(published.state);
    state.releases = [];
    const adapter = new FakeGitHubPublicationAdapter({ state });

    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: 'pre-existing-publication-state',
    });
    expect(adapter.applied).toEqual([]);
    expect(adapter.log).not.toContain('create-draft');
  });

  it('fails closed on an initial missing-asset draft without mutating', async () => {
    const bundle = publicationBundle();
    const adapter = await preexistingDraftAdapter(bundle);
    adapter.state.releases![0].assets = adapter.state.releases![0].assets.filter(
      asset => asset.name !== bundle.finalPlan.requiredAssets[0]
    );
    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: 'pre-existing-publication-state',
    });
    expect(adapter.applied).toEqual([]);
  });

  it('fails closed on an initial publish-ready draft without mutating', async () => {
    const bundle = publicationBundle();
    const adapter = await preexistingDraftAdapter(bundle);
    await expect(executePublication({ adapter, bundle })).resolves.toMatchObject({
      status: 'unknown-critical',
      reason: 'pre-existing-publication-state',
    });
    expect(adapter.applied).toEqual([]);
  });
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
