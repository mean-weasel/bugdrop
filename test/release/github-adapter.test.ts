import { describe, expect, it, vi } from 'vitest';

import { canonicalize } from '../../scripts/release/canonical-json.mjs';
import {
  authenticatePublishedAssets,
  createGithubTransport,
  createRequestPlanFromGithub,
  GithubAdapterError,
  loadPublishedReleaseAssets,
  observeGithubState,
  paginateGithub,
} from '../../scripts/release/github-adapter.mjs';
import {
  buildPublicationMarker,
  findCompletedPlan,
  normalizeDispatch,
} from '../../scripts/release/plan.mjs';
import { workflowBundle, workflowContext } from '../fixtures/release/workflow/bundle';

const SHA = {
  target: 'a'.repeat(40),
  tagObject: 'b'.repeat(40),
  release: 'c'.repeat(40),
};
const REPOSITORY = 'mean-weasel/bugdrop';

function transportFor(entries: Record<string, unknown>) {
  return {
    request: vi.fn(async (path: string) => {
      if (!Object.hasOwn(entries, path)) throw new Error(`unexpected request ${path}`);
      return entries[path];
    }),
  };
}

function observationEntries() {
  return {
    [`/repos/${REPOSITORY}/releases?per_page=100&page=1`]: {
      data: [
        {
          id: 7,
          tag_name: 'v1.55.0',
          draft: false,
          prerelease: false,
          published_at: '2026-08-01T00:00:00Z',
          html_url: 'https://github.test/releases/v1.55.0',
          body: 'Notes',
        },
      ],
      hasNext: false,
    },
    [`/repos/${REPOSITORY}/git/matching-refs/tags/v?per_page=100&page=1`]: {
      data: [
        {
          ref: 'refs/tags/v1.55.0',
          object: { type: 'tag', sha: SHA.tagObject },
        },
      ],
      hasNext: false,
    },
    [`/repos/${REPOSITORY}/git/tags/${SHA.tagObject}`]: {
      data: { object: { type: 'commit', sha: SHA.release }, message: 'BugDrop v1.55.0' },
      hasNext: false,
    },
    [`/repos/${REPOSITORY}/compare/${SHA.release}...${SHA.target}`]: {
      data: { status: 'ahead' },
      hasNext: false,
    },
  };
}

describe('GitHub release-state observation', () => {
  it('builds a deterministic request plan from complete authenticated observations', async () => {
    const entries = observationEntries();
    entries[`/repos/${REPOSITORY}/compare/${SHA.release}...${SHA.target}`] = {
      data: {
        status: 'ahead',
        ahead_by: 1,
        html_url: 'https://github.test/compare/v1.55.0...candidate',
        commits: [
          {
            sha: SHA.target,
            commit: { message: 'Ship guarded workflow\n\nBody' },
          },
        ],
        files: [{ filename: 'src/index.ts' }],
      },
      hasNext: false,
    };
    Object.assign(entries, {
      [`/repos/${REPOSITORY}/commits/${SHA.target}`]: {
        data: {
          sha: SHA.target,
          commit: { committer: { date: '2026-08-03T00:00:00Z' } },
        },
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/commits/main`]: {
        data: { sha: SHA.target },
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/compare/${SHA.release}...main`]: {
        data: { status: 'ahead' },
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/commits/${SHA.target}/check-runs?per_page=100&page=1`]: {
        data: { check_runs: [{ status: 'completed', conclusion: 'success' }] },
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/compare/${SHA.target}...main`]: {
        data: { status: 'identical' },
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/compare/${SHA.target}...${SHA.target}`]: {
        data: { status: 'identical', ahead_by: 0 },
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/commits/${SHA.target}/pulls?per_page=100&page=1`]: {
        data: [
          {
            number: 42,
            title: 'Ship guarded workflow',
            html_url: 'https://github.test/pull/42',
            merge_commit_sha: SHA.target,
            labels: [{ name: 'enhancement' }],
          },
        ],
        hasNext: false,
      },
    });
    const plan = await createRequestPlanFromGithub({
      transport: transportFor(entries),
      gitObserver: () => ({
        commits: [{ sha: SHA.target, subject: 'Ship guarded workflow' }],
        changedPaths: ['src/index.ts'],
        excludedNewerMainCommits: [],
        candidateCommitTimestamp: '2026-08-03T00:00:00Z',
        candidateBehindMainBy: 0,
        facts: {
          candidateRef: 'refs/heads/main',
          targetExists: true,
          targetReachableFromMain: true,
          previousReleaseAncestor: true,
          targetStrictlyLater: true,
          controllerReachableFromMain: true,
        },
      }),
      context: {
        repositoryDir: '/controller',
        dispatch: {
          repository: REPOSITORY,
          workflowRef: '.github/workflows/deploy.yml@refs/heads/main',
          targetSha: SHA.target,
          controllerSha: SHA.release,
          bump: 'patch',
          releaseReason: 'standard',
          rationale: '',
          operatorNotes: '',
          dryRun: true,
        },
      },
    });
    expect(plan).toMatchObject({
      request: { previousTag: 'v1.55.0', nextTag: 'v1.55.1', targetSha: SHA.target },
      source: { controllerSha: SHA.release, remoteMainSha: SHA.target },
      attestation: {
        expectedAliases: ['widget.js', 'widget.v1.js', 'widget.v1.55.js'],
        expectedAssetNames: ['widget.v1.55.1.js', 'versions.json'],
      },
    });
    expect(plan.inventory.pullRequests).toHaveLength(1);
  });

  it('reconstructs an exact completed plan from durable canonical Release assets', () => {
    const bundle = workflowBundle();
    const release = authenticatePublishedAssets({
      release: {
        tag: bundle.finalPlan.tag,
        targetSha: bundle.finalPlan.targetSha,
        resolvedTagSha: bundle.finalPlan.targetSha,
        published: true,
        draft: false,
        prerelease: false,
        marker: buildPublicationMarker(bundle.finalPlan),
      },
      assets: bundle.assets,
    });
    expect(
      findCompletedPlan({
        dispatch: normalizeDispatch(workflowContext(false).dispatch),
        releases: [release],
        containsTarget: () => false,
      })
    ).toMatchObject({ kind: 'completed', planIdentity: bundle.finalPlan.planIdentity });

    expect(() =>
      authenticatePublishedAssets({
        release,
        assets: {
          ...bundle.assets,
          'request-plan.json': Buffer.from('{}\n'),
        },
      })
    ).toThrow(GithubAdapterError);
  });

  it('downloads every named Release asset through the injected binary transport', async () => {
    const bundle = workflowBundle();
    const release = {
      tag: bundle.finalPlan.tag,
      targetSha: bundle.finalPlan.targetSha,
      resolvedTagSha: bundle.finalPlan.targetSha,
      published: true,
      draft: false,
      prerelease: false,
      marker: buildPublicationMarker(bundle.finalPlan),
      assets: Object.keys(bundle.assets).map(name => ({
        name,
        apiUrl: `https://api.github.test/assets/${name}`,
      })),
    };
    const requestBytes = vi.fn(async (url: string) => {
      const name = url.split('/').at(-1) as keyof typeof bundle.assets;
      return bundle.assets[name];
    });
    await expect(
      loadPublishedReleaseAssets({ transport: { requestBytes }, release })
    ).resolves.toMatchObject({
      finalPlan: { planIdentity: bundle.finalPlan.planIdentity },
      assetVerification: { complete: true, checksumsMatch: true },
    });
    expect(requestBytes).toHaveBeenCalledTimes(bundle.finalPlan.requiredAssets.length);
  });

  it('returns an authenticated completed no-op before local Git planning', async () => {
    const bundle = workflowBundle();
    const marker = buildPublicationMarker(bundle.finalPlan);
    const encodedMarker = Buffer.from(canonicalize(marker)).toString('base64url');
    const tagObjectSha = '9'.repeat(40);
    const releaseAssets = Object.keys(bundle.assets).map(name => ({
      name,
      url: `https://api.github.test/assets/${name}`,
    }));
    const transport = transportFor({
      [`/repos/${REPOSITORY}/releases?per_page=100&page=1`]: {
        data: [
          {
            id: 8,
            tag_name: bundle.finalPlan.tag,
            draft: false,
            prerelease: false,
            published_at: '2026-08-03T00:00:00Z',
            html_url: 'https://github.test/releases/completed',
            body: `<!-- bugdrop-publication ${encodedMarker} -->`,
            assets: releaseAssets,
          },
        ],
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/git/matching-refs/tags/v?per_page=100&page=1`]: {
        data: [
          {
            ref: `refs/tags/${bundle.finalPlan.tag}`,
            object: { type: 'tag', sha: tagObjectSha },
          },
        ],
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/git/tags/${tagObjectSha}`]: {
        data: {
          object: { type: 'commit', sha: bundle.finalPlan.targetSha },
          message: `BugDrop ${bundle.finalPlan.tag}\n\n${canonicalize(marker)}`,
        },
        hasNext: false,
      },
      [`/repos/${REPOSITORY}/compare/${bundle.finalPlan.targetSha}...${bundle.finalPlan.targetSha}`]:
        {
          data: { status: 'identical' },
          hasNext: false,
        },
    });
    Object.assign(transport, {
      requestBytes: vi.fn(async (url: string) => {
        const name = url.split('/').at(-1) as keyof typeof bundle.assets;
        return bundle.assets[name];
      }),
    });
    const gitObserver = vi.fn(() => expect.unreachable('completed plans must not inspect Git'));
    await expect(
      createRequestPlanFromGithub({
        transport,
        gitObserver,
        context: workflowContext(false),
      })
    ).resolves.toEqual({
      status: 'completed',
      planIdentity: bundle.finalPlan.planIdentity,
      tag: bundle.finalPlan.tag,
      targetSha: bundle.finalPlan.targetSha,
    });
    expect(gitObserver).not.toHaveBeenCalled();
  });

  it('rejects an invalid planning dispatch before GitHub access', async () => {
    const transport = transportFor({});
    await expect(
      createRequestPlanFromGithub({
        transport,
        context: {
          dispatch: {
            repository: REPOSITORY,
            workflowRef: '.github/workflows/deploy.yml@refs/heads/main',
            targetSha: 'short',
            controllerSha: SHA.release,
            bump: 'patch',
            releaseReason: 'standard',
          },
        },
      })
    ).rejects.toThrow(/targetSha/);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('normalizes annotated tags, Releases, and candidate ancestry', async () => {
    const state = await observeGithubState({
      transport: transportFor(observationEntries()),
      repository: REPOSITORY,
      targetSha: SHA.target,
    });
    expect(state.refs).toEqual([
      expect.objectContaining({ tag: 'v1.55.0', sha: SHA.release, kind: 'annotated' }),
    ]);
    expect(state.published).toEqual([
      expect.objectContaining({
        tag: 'v1.55.0',
        targetSha: SHA.release,
        resolvedTagSha: SHA.release,
        relationToTarget: 'ancestor',
      }),
    ]);
  });

  it('follows explicit pagination and rejects ambiguous pagination metadata', async () => {
    const transport = transportFor({
      '/records?per_page=2&page=1': { data: [1, 2], hasNext: true },
      '/records?per_page=2&page=2': { data: [3], hasNext: false },
    });
    await expect(paginateGithub(transport, '/records', { perPage: 2 })).resolves.toEqual([1, 2, 3]);
    await expect(
      paginateGithub(transportFor({ '/records?per_page=100&page=1': { data: [] } }), '/records')
    ).rejects.toThrow(GithubAdapterError);
  });

  it.each([
    ['mixed-case target', { targetSha: `A${SHA.target.slice(1)}` }],
    ['invalid repository', { repository: '../other' }],
  ])('rejects %s before transport access', async (_name, change) => {
    const transport = transportFor({});
    await expect(
      observeGithubState({
        transport,
        repository: REPOSITORY,
        targetSha: SHA.target,
        ...change,
      })
    ).rejects.toThrow(GithubAdapterError);
    expect(transport.request).not.toHaveBeenCalled();
  });

  it('fails closed on divergent history and duplicate identity markers', async () => {
    const divergent = observationEntries();
    divergent[`/repos/${REPOSITORY}/compare/${SHA.release}...${SHA.target}`] = {
      data: { status: 'diverged' },
      hasNext: false,
    };
    await expect(
      observeGithubState({
        transport: transportFor(divergent),
        repository: REPOSITORY,
        targetSha: SHA.target,
      })
    ).rejects.toThrow(/diverge/);

    const duplicate = observationEntries();
    duplicate[`/repos/${REPOSITORY}/releases?per_page=100&page=1`].data[0].body =
      '<!-- bugdrop-publication e30 -->\n<!-- bugdrop-publication e30 -->';
    await expect(
      observeGithubState({
        transport: transportFor(duplicate),
        repository: REPOSITORY,
        targetSha: SHA.target,
      })
    ).rejects.toThrow(/multiple identity markers/);
  });
});

describe('authenticated transport', () => {
  it('keeps tokens out of errors while requiring complete JSON responses', async () => {
    const token = 'top-secret-token';
    const fetchImpl = vi.fn(
      async () => new Response('failure', { status: 502, headers: { link: '' } })
    );
    const transport = createGithubTransport({ token, fetchImpl });
    let message = '';
    try {
      await transport.request('/repos/owner/repo/releases');
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('502');
    expect(message).not.toContain(token);
  });

  it('does not forward the GitHub token to redirected asset storage', async () => {
    const calls: Array<[URL | RequestInfo, RequestInit | undefined]> = [];
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, options?: RequestInit) => {
      calls.push([url, options]);
      if (calls.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://objects.example.test/release-asset' },
        });
      }
      return new Response('asset bytes', { status: 200 });
    });
    const transport = createGithubTransport({ token: 'repository-token', fetchImpl });
    await expect(transport.requestBytes('/repos/owner/repo/releases/assets/1')).resolves.toEqual(
      Buffer.from('asset bytes')
    );
    expect(calls[0][1]?.headers).toMatchObject({ authorization: 'Bearer repository-token' });
    expect(calls[1][1]?.headers).not.toHaveProperty('authorization');
  });
});
