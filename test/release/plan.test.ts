import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalHash } from '../../scripts/release/canonical-json.mjs';

import {
  ReleasePlanError,
  buildAuditEnvelope,
  buildFinalPlan,
  buildPublicationMarker,
  buildReleaseContent,
  buildReleaseInventory,
  buildRequestPlan,
  calculateNextTag,
  findCompletedPlan,
  normalizeDispatch,
  normalizeGithubState,
  publishedFrontier,
  revalidatePlan,
  resolvePartialPublication,
  selectStoredController,
  validateSourceContext,
} from '../../scripts/release/plan.mjs';

const SHA = {
  target: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  main: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  controller: 'cccccccccccccccccccccccccccccccccccccccc',
};
const fixturePath = fileURLToPath(
  new URL('../fixtures/release/github-states.json', import.meta.url)
);
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));

const rawDispatch = {
  repository: 'mean-weasel/bugdrop',
  workflowRef: '.github/workflows/release.yml@refs/heads/main',
  targetSha: SHA.target,
  controllerSha: SHA.controller,
  bump: 'patch',
  releaseReason: 'weekly',
  rationale: 'Routine weekly release\r\nApproved inventory.',
  operatorNotes: 'Ship it',
};

function requestPlan(overrides = {}) {
  const inventory = buildReleaseInventory({
    compareUrl: 'https://github.test/compare/v1.2.0...target',
    pullRequests: [
      {
        number: 42,
        sha: SHA.target,
        title: 'Fix annotations',
        url: 'https://github.test/pull/42',
        labels: ['bug'],
      },
    ],
    commits: [{ sha: SHA.target, subject: 'Fix annotations' }],
    changedPaths: ['src/widget.ts'],
    excludedNewerMainCommits: [{ sha: SHA.main, subject: 'Held for next week' }],
  });
  return buildRequestPlan({
    dispatch: normalizeDispatch({ ...rawDispatch, ...overrides }),
    previousTag: 'v1.2.0',
    nextTag: 'v1.2.1',
    generatedNotes: inventory.generatedNotes,
    controllerSha: SHA.controller,
    remoteMainSha: SHA.main,
    inventory,
    attestation: {
      previousReleaseSha: '1'.repeat(40),
      candidateCommitTimestamp: '2026-08-01T12:00:00Z',
      candidateBehindMainBy: 1,
      expectedAliases: ['widget.js'],
      expectedAssetNames: ['widget.v1.2.1.js'],
      verificationCommands: ['npm test'],
    },
  });
}

function completedRelease(plan = requestPlan()) {
  const content = buildReleaseContent({
    requestPlan: plan,
    artifactHashes: { 'widget.v1.2.1.js': 'f'.repeat(64) },
    sourceDigests: { worker: 'e'.repeat(64), lockfile: 'd'.repeat(64) },
    toolchain: { esbuild: '0.28.0', wrangler: '4.92.0' },
    deploymentConfigDigest: 'c'.repeat(64),
    verification: { contract: 'release-verification/v1', result: 'passed' },
  });
  const finalPlan = buildFinalPlan({ requestPlan: plan, releaseContent: content });
  const marker = buildPublicationMarker(finalPlan);
  return {
    tag: plan.request.nextTag,
    targetSha: plan.request.targetSha,
    resolvedTagSha: plan.request.targetSha,
    published: true,
    draft: false,
    prerelease: false,
    reachableFromTarget: true,
    requestPlan: plan,
    releaseContent: content,
    finalPlan,
    marker,
    assetVerification: {
      complete: true,
      checksumsMatch: true,
      unexpectedConflicts: false,
      planIdentity: finalPlan.planIdentity,
      contentIdentity: content.contentIdentity,
      verifiedAssetNames: finalPlan.requiredAssets,
    },
    url: 'https://github.test/releases/v1.2.1',
  };
}

function recomputeInjectedRelease(mutate) {
  const release = structuredClone(completedRelease());
  mutate(release);
  release.requestPlan.requestIdentity = canonicalHash({
    schema: release.requestPlan.schema,
    request: release.requestPlan.request,
  });
  release.releaseContent.requestIdentity = release.requestPlan.requestIdentity;
  const contentPayload = { ...release.releaseContent };
  delete contentPayload.contentIdentity;
  release.releaseContent.contentIdentity = canonicalHash(contentPayload);
  Object.assign(release.finalPlan, {
    requestIdentity: release.requestPlan.requestIdentity,
    contentIdentity: release.releaseContent.contentIdentity,
    requestPlanHash: canonicalHash(release.requestPlan),
  });
  const finalPayload = { ...release.finalPlan };
  delete finalPayload.planIdentity;
  release.finalPlan.planIdentity = canonicalHash(finalPayload);
  release.marker = buildPublicationMarker(release.finalPlan);
  release.assetVerification.planIdentity = release.finalPlan.planIdentity;
  release.assetVerification.contentIdentity = release.releaseContent.contentIdentity;
  return release;
}

function recomputeCompletedIdentities(release) {
  release.requestPlan.requestIdentity = canonicalHash({
    schema: release.requestPlan.schema,
    request: release.requestPlan.request,
  });
  release.releaseContent.requestIdentity = release.requestPlan.requestIdentity;
  const contentPayload = { ...release.releaseContent };
  delete contentPayload.contentIdentity;
  release.releaseContent.contentIdentity = canonicalHash(contentPayload);
  release.finalPlan.requestIdentity = release.requestPlan.requestIdentity;
  release.finalPlan.contentIdentity = release.releaseContent.contentIdentity;
  release.finalPlan.requestPlanHash = canonicalHash(release.requestPlan);
  const finalPayload = { ...release.finalPlan };
  delete finalPayload.planIdentity;
  release.finalPlan.planIdentity = canonicalHash(finalPayload);
  release.marker = buildPublicationMarker(release.finalPlan);
  release.assetVerification.planIdentity = release.finalPlan.planIdentity;
  release.assetVerification.contentIdentity = release.releaseContent.contentIdentity;
  return release;
}

describe('dispatch and source trust', () => {
  it('accepts an older full main-history candidate while keeping a separate controller', () => {
    const dispatch = normalizeDispatch(rawDispatch);
    expect(
      validateSourceContext(dispatch, {
        candidateRef: 'refs/heads/main',
        targetExists: true,
        targetReachableFromMain: true,
        controllerReachableFromMain: true,
        previousReleaseAncestor: true,
        targetStrictlyLater: true,
        laterReleaseContainsTarget: false,
        preflightSuccessful: true,
      })
    ).toEqual(dispatch);
  });

  it.each([
    ['abbreviated SHA', { targetSha: 'abcdef1' }],
    ['mixed-case SHA', { targetSha: `A${SHA.target.slice(1)}` }],
    ['mutable controller', { controllerSha: 'refs/heads/main' }],
  ])('rejects %s', (_name, change) => {
    expect(() => normalizeDispatch({ ...rawDispatch, ...change })).toThrow(ReleasePlanError);
  });

  it.each([
    ['unknown reason', { releaseReason: 'routine' }],
    ['emergency without rationale', { releaseReason: 'emergency', rationale: '   ' }],
    ['unbounded notes', { operatorNotes: 'x'.repeat(5001) }],
  ])('rejects %s', (_name, change) => {
    expect(() => normalizeDispatch({ ...rawDispatch, ...change })).toThrow(ReleasePlanError);
  });

  it.each([
    ['non-main ref', { candidateRef: 'refs/pull/1/merge', targetReachableFromMain: true }],
    ['unreachable target', { candidateRef: 'refs/heads/main', targetReachableFromMain: false }],
    ['missing target', { candidateRef: 'refs/heads/main', targetExists: false }],
    ['frontier not ancestor', { candidateRef: 'refs/heads/main', previousReleaseAncestor: false }],
    ['empty range', { candidateRef: 'refs/heads/main', targetStrictlyLater: false }],
    [
      'later containing release',
      { candidateRef: 'refs/heads/main', laterReleaseContainsTarget: true },
    ],
    ['missing preflight', { candidateRef: 'refs/heads/main', preflightSuccessful: false }],
  ])('fails closed for %s', (_name, facts) => {
    expect(() =>
      validateSourceContext(normalizeDispatch(rawDispatch), {
        controllerReachableFromMain: true,
        targetExists: true,
        previousReleaseAncestor: true,
        targetStrictlyLater: true,
        laterReleaseContainsTarget: false,
        preflightSuccessful: true,
        ...facts,
      })
    ).toThrow(ReleasePlanError);
  });

  it('rejects a controller that differs from the authenticated dispatch controller', () => {
    expect(() =>
      buildRequestPlan({
        ...requestPlan(),
        dispatch: normalizeDispatch(rawDispatch),
        controllerSha: 'd'.repeat(40),
      })
    ).toThrow(/CONTROLLER_MISMATCH/);
  });
});

describe('complete compare and PR provenance', () => {
  it('keeps an unfiltered inventory while categorizing deterministic public notes', () => {
    const inventory = buildReleaseInventory({
      compareUrl: 'https://github.test/compare/v1...target',
      pullRequests: [
        {
          number: 2,
          sha: '2'.repeat(40),
          title: 'Bump dep',
          url: 'https://x/2',
          labels: ['dependencies'],
        },
        {
          number: 1,
          sha: '1'.repeat(40),
          title: 'Add capture',
          url: 'https://x/1',
          labels: ['enhancement'],
        },
      ],
      commits: [
        { sha: '2'.repeat(40), subject: 'Bump dep' },
        { sha: '1'.repeat(40), subject: 'Add capture' },
      ],
      changedPaths: ['test/a.ts', 'src/b.ts', 'src/a.ts'],
      excludedNewerMainCommits: [{ sha: '3'.repeat(40), subject: 'Held stack PR' }],
    });
    expect(inventory.pullRequests.map(pr => pr.number)).toEqual([1, 2]);
    expect(inventory.changedTopLevelPaths).toEqual(['src', 'test']);
    expect(inventory.generatedNotes).toContain('Add capture (#1)');
    expect(inventory.generatedNotes).not.toContain('Bump dep');
    expect(inventory.excludedNewerMainCommits).toHaveLength(1);
  });
});

describe('published frontier and SemVer', () => {
  it('uses only a consistent, reachable, stable published Release', () => {
    const state = normalizeGithubState(fixtures.published);
    expect(publishedFrontier(state)?.tag).toBe('v1.2.0');
  });

  it.each([
    ['patch', 'v1.2.4'],
    ['minor', 'v1.3.0'],
    ['major', 'v2.0.0'],
  ])('applies explicit %s bump', (bump, expected) => {
    expect(calculateNextTag('v1.2.3', bump)).toBe(expected);
  });

  it.each(['v1.2', '1.2.3', 'v1.2.3-beta.1', 'v1.2.3+build', 'v01.2.3'])(
    'rejects malformed or non-stable tag %s',
    tag => expect(() => calculateNextTag(tag, 'patch')).toThrow(ReleasePlanError)
  );

  it('keeps tag-only and draft state outside the frontier', () => {
    const state = normalizeGithubState(fixtures.partial);
    expect(publishedFrontier(state)?.tag).toBe('v1.2.0');
    expect(state.partials.map(({ tag }) => tag)).toContain('v1.2.1');
  });

  it('fails closed when the API state is incomplete', () => {
    expect(() => normalizeGithubState({ ...fixtures.published, apiComplete: false })).toThrow(
      /API_STATE_UNCERTAIN/
    );
  });

  it('rejects duplicate published Releases even when their tag and target agree', () => {
    const release = {
      tag: 'v1.2.0',
      targetSha: SHA.target,
      published: true,
      draft: false,
      prerelease: false,
      relationToTarget: 'ancestor',
    };
    expect(() =>
      normalizeGithubState({
        refs: [{ tag: release.tag, sha: release.targetSha }],
        releases: [release, { ...release }],
      })
    ).toThrow(/AMBIGUOUS_RELEASE/);
  });

  it.each([
    [
      'malformed published tag',
      { tag: 'release-1.2.0', targetSha: SHA.target, relationToTarget: 'ancestor' },
    ],
    ['divergent ref', { tag: 'v1.2.0', targetSha: SHA.target, relationToTarget: 'ancestor' }],
    [
      'divergent history',
      { tag: 'v1.2.0', targetSha: '1'.repeat(40), relationToTarget: 'divergent' },
    ],
  ])('rejects %s', (_name, release) => {
    const refSha = _name === 'divergent ref' ? '1'.repeat(40) : release.targetSha;
    expect(() =>
      normalizeGithubState({
        refs: [{ tag: release.tag, sha: refSha }],
        releases: [{ ...release, published: true, draft: false, prerelease: false }],
      })
    ).toThrow(ReleasePlanError);
  });
});

describe('deterministic identities and completed-plan lookup', () => {
  it('creates request identity before content identity and final approval identity', () => {
    const request = requestPlan();
    expect(request.requestIdentity).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(request).not.toHaveProperty('contentIdentity');
    const release = completedRelease(request);
    expect(release.releaseContent.contentIdentity).not.toBe(request.requestIdentity);
    expect(release.finalPlan.planIdentity).not.toBe(release.releaseContent.contentIdentity);
  });

  it('keeps dry-run execution control out of a repeated request identity', () => {
    expect(requestPlan({ dryRun: true }).requestIdentity).toBe(
      requestPlan({ dryRun: false }).requestIdentity
    );
  });

  it('keeps run, artifact storage, timing, and approval observations out of identity', () => {
    const release = completedRelease();
    const first = buildAuditEnvelope({
      finalPlan: release.finalPlan,
      execution: { runId: 1, approvedAt: '2026-08-01T00:00:00Z' },
    });
    const second = buildAuditEnvelope({
      finalPlan: release.finalPlan,
      execution: { runId: 2, artifactId: 99, approvedAt: '2026-08-02T00:00:00Z' },
    });
    expect(first.planIdentity).toBe(second.planIdentity);
    expect(first.execution).not.toEqual(second.execution);
  });

  it('rejects execution-shaped fields from deterministic release content', () => {
    const plan = requestPlan();
    expect(() =>
      buildReleaseContent({
        requestPlan: plan,
        artifactHashes: { 'widget.v1.2.1.js': 'f'.repeat(64) },
        sourceDigests: { worker: 'e'.repeat(64), lockfile: 'd'.repeat(64), runId: '42' },
        toolchain: { esbuild: '0.28.0', wrangler: '4.92.0' },
        deploymentConfigDigest: 'c'.repeat(64),
        verification: { contract: 'release-verification/v1', result: 'passed' },
      })
    ).toThrow(/INVALID_SCHEMA/);
  });

  it.each([
    ['request', release => (release.requestPlan.request.runId = 7)],
    ['source', release => (release.requestPlan.source.approvedAt = 'now')],
    ['attestation', release => (release.requestPlan.attestation.artifactId = 8)],
    ['inventory child', release => (release.requestPlan.inventory.pullRequests[0].runId = 9)],
    ['release content', release => (release.releaseContent.approvalActor = 'maintainer')],
    ['final plan', release => (release.finalPlan.jobTiming = 10)],
  ])('rejects recomputed identity with injected %s execution data', (_name, mutate) => {
    const release = recomputeInjectedRelease(mutate);
    expect(() =>
      findCompletedPlan({
        dispatch: normalizeDispatch(rawDispatch),
        releases: [release],
        containsTarget: () => false,
      })
    ).toThrow(/INVALID_SCHEMA/);
  });

  it('authenticates an exact completed request before recalculating the frontier', () => {
    const release = completedRelease();
    expect(
      findCompletedPlan({
        dispatch: normalizeDispatch(rawDispatch),
        releases: [release],
        containsTarget: () => false,
      })
    ).toMatchObject({ kind: 'completed', planIdentity: release.finalPlan.planIdentity });
  });

  it.each([
    ['changed bump', { dispatch: { ...rawDispatch, bump: 'minor' } }],
    ['changed rationale', { dispatch: { ...rawDispatch, rationale: 'Different rationale' } }],
    ['changed notes', { dispatch: { ...rawDispatch, operatorNotes: 'Different notes' } }],
    [
      'changed reason',
      { dispatch: { ...rawDispatch, releaseReason: 'emergency', rationale: 'Urgent fix' } },
    ],
    ['missing content', { mutate: release => delete release.releaseContent }],
    ['conflicting marker', { mutate: release => (release.marker.planIdentity = 'sha256:bad') }],
    ['missing checksum proof', { mutate: release => delete release.assetVerification }],
    [
      'unsupported protocol',
      { mutate: release => (release.requestPlan.protocol = 'release-plan/v0') },
    ],
  ])('fails closed for exact-target %s', (_name, setup) => {
    const release = completedRelease();
    if ('mutate' in setup) setup.mutate(release);
    const dispatch = 'dispatch' in setup ? setup.dispatch : rawDispatch;
    expect(() =>
      findCompletedPlan({
        dispatch: normalizeDispatch(dispatch),
        releases: [release],
        containsTarget: () => false,
      })
    ).toThrow(ReleasePlanError);
  });

  it.each([
    ['request run ID', release => (release.requestPlan.request.runId = 123)],
    ['source approval', release => (release.requestPlan.source.approvedAt = 'now')],
    ['attestation timing', release => (release.requestPlan.attestation.jobStartedAt = 'now')],
    [
      'pull request artifact ID',
      release => (release.requestPlan.inventory.pullRequests[0].artifactId = 7),
    ],
    ['commit run ID', release => (release.requestPlan.inventory.commits[0].runId = 7)],
    [
      'categorized pull request approval',
      release => (release.requestPlan.inventory.categorized.Fixes[0].approvedBy = 'attacker'),
    ],
    ['release-content artifact storage', release => (release.releaseContent.artifactId = 99)],
    ['final-plan approval time', release => (release.finalPlan.approvedAt = 'now')],
  ])('rejects recomputed completed records containing %s', (_name, inject) => {
    const release = completedRelease();
    inject(release);
    recomputeCompletedIdentities(release);
    expect(() =>
      findCompletedPlan({
        dispatch: normalizeDispatch(rawDispatch),
        releases: [release],
        containsTarget: () => false,
      })
    ).toThrow(/INVALID_SCHEMA|COMPLETED_PLAN_CONFLICT/);
  });

  it('rejects a target already contained by a later release', () => {
    const later = { ...completedRelease(), targetSha: 'd'.repeat(40) };
    expect(
      findCompletedPlan({
        dispatch: normalizeDispatch(rawDispatch),
        releases: [later],
        containsTarget: () => true,
      })
    ).toEqual({ kind: 'already-contained', release: later });
  });
});

describe('partial retry and stale revalidation', () => {
  it('selects the authenticated stored controller for a partial retry', () => {
    expect(
      selectStoredController({
        storedControllerSha: SHA.controller,
        storedProtocol: 'release-plan/v1',
        supportedProtocols: ['release-plan/v1'],
        controllerReachableFromMain: true,
      })
    ).toBe(SHA.controller);
  });

  it('rejects an unsupported or unauthenticated stored controller', () => {
    expect(() =>
      selectStoredController({
        storedControllerSha: SHA.controller,
        storedProtocol: 'release-plan/v0',
        supportedProtocols: ['release-plan/v1'],
        controllerReachableFromMain: true,
      })
    ).toThrow(ReleasePlanError);
  });

  it('keeps the authenticated historical controller when current main uses a newer one', () => {
    expect(
      selectStoredController({
        storedControllerSha: SHA.controller,
        currentControllerSha: SHA.main,
        storedProtocol: 'release-plan/v1',
        supportedProtocols: ['release-plan/v1'],
        controllerReachableFromMain: true,
      })
    ).toBe(SHA.controller);
  });

  it('resumes a partial tag at the same version and finalized identity', () => {
    const release = completedRelease();
    const state = normalizeGithubState({
      refs: [
        {
          tag: 'v1.2.1',
          sha: SHA.target,
          kind: 'annotated',
          marker: release.marker,
        },
      ],
      releases: [],
    });
    expect(
      resolvePartialPublication({
        state,
        requestPlan: release.requestPlan,
        storedFinalPlan: release.finalPlan,
      })
    ).toMatchObject({
      kind: 'resume',
      tag: 'v1.2.1',
      planIdentity: release.finalPlan.planIdentity,
    });
  });

  it('fails instead of incrementing when a partial tag belongs to another SHA', () => {
    const release = completedRelease();
    const state = normalizeGithubState({
      refs: [
        {
          tag: 'v1.2.1',
          sha: 'd'.repeat(40),
          kind: 'annotated',
          marker: release.marker,
        },
      ],
      releases: [],
    });
    expect(() =>
      resolvePartialPublication({
        state,
        requestPlan: release.requestPlan,
        storedFinalPlan: release.finalPlan,
      })
    ).toThrow(/PARTIAL_PLAN_CONFLICT/);
  });

  it('resumes an authenticated partial draft and rejects a lightweight partial tag', () => {
    const release = completedRelease();
    const draftState = normalizeGithubState({
      refs: [{ tag: 'v1.2.1', sha: SHA.target, kind: 'annotated', marker: release.marker }],
      releases: [{ tag: 'v1.2.1', targetSha: SHA.target, draft: true, marker: release.marker }],
    });
    expect(
      resolvePartialPublication({
        state: draftState,
        requestPlan: release.requestPlan,
        storedFinalPlan: release.finalPlan,
      })
    ).toMatchObject({ kind: 'resume', nextSteps: ['verify-assets', 'publish-draft'] });
    const lightweight = normalizeGithubState({
      refs: [{ tag: 'v1.2.1', sha: SHA.target, kind: 'lightweight' }],
      releases: [],
    });
    expect(() =>
      resolvePartialPublication({
        state: lightweight,
        requestPlan: release.requestPlan,
        storedFinalPlan: release.finalPlan,
      })
    ).toThrow(/PARTIAL_PLAN_CONFLICT/);
  });

  it('rejects a partial tag whose stored controller provenance was changed', () => {
    const release = completedRelease();
    const state = normalizeGithubState({
      refs: [
        {
          tag: 'v1.2.1',
          sha: SHA.target,
          kind: 'annotated',
          marker: release.marker,
        },
      ],
      releases: [],
    });
    const changed = { ...release.finalPlan, controllerSha: 'd'.repeat(40) };
    expect(() =>
      resolvePartialPublication({
        state,
        requestPlan: release.requestPlan,
        storedFinalPlan: changed,
      })
    ).toThrow(/INVALID_SCHEMA|PARTIAL_PLAN_UNAUTHENTICATED/);
  });

  it('lets a concurrent exact winner become a no-op before stale checks', () => {
    const release = completedRelease();
    expect(
      revalidatePlan({
        requestPlan: release.requestPlan,
        releases: [release],
        containsTarget: () => false,
        snapshot: { remoteMainSha: SHA.main, frontierTag: 'v1.2.0' },
        current: { remoteMainSha: 'd'.repeat(40), frontierTag: 'v1.2.1' },
      })
    ).toMatchObject({ kind: 'completed' });
  });

  it.each([
    ['main', { remoteMainSha: 'd'.repeat(40), frontierTag: 'v1.2.0' }],
    ['frontier', { remoteMainSha: SHA.main, frontierTag: 'v1.2.1' }],
  ])('fails a stale %s snapshot without recalculating', (_name, current) => {
    expect(() =>
      revalidatePlan({
        requestPlan: requestPlan(),
        releases: [],
        containsTarget: () => false,
        snapshot: { remoteMainSha: SHA.main, frontierTag: 'v1.2.0' },
        current,
      })
    ).toThrow(/STALE_PLAN/);
  });
});
