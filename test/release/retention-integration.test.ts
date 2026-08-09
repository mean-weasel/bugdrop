import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { canonicalize } from '../../scripts/release/canonical-json.mjs';
import {
  authenticatePublishedAssets,
  createGithubTransport,
  createRequestPlanFromGithub,
} from '../../scripts/release/github-adapter.mjs';
import {
  buildPublicationMarker,
  buildReleaseInventory,
  buildRequestPlan,
} from '../../scripts/release/plan.mjs';
import { writeRetentionInput } from '../../scripts/release/retention.mjs';
import { resolveStaticArtifactRetry } from '../../scripts/release/static-assets.mjs';
import { hashStaticTree } from '../../scripts/release/static-tree.mjs';
import { createState2BundleFromStaticPackage } from '../../scripts/release/workflow.mjs';
import { buildExpectedLive } from '../../scripts/release/live-release.mjs';
import { disabledV2WorkflowBundle } from '../fixtures/release/workflow/bundle';

const ROOT = resolve(import.meta.dirname, '../..');
const CANDIDATE = join(ROOT, 'test/fixtures/release/static-assets/older-candidate');
const roots: string[] = [];
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const REPOSITORY = 'mean-weasel/bugdrop';
const CONTROLLER = 'b'.repeat(40);
const N_SHA = 'c'.repeat(40);
const N1_SHA = 'a'.repeat(40);

afterEach(async () =>
  Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
);

async function vertical({ postBoundaryLegacy = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'bugdrop-n-n1-'));
  roots.push(root);
  const candidateN = join(root, 'candidate-n');
  const candidate = join(root, 'candidate-n1');
  const outputN = join(root, 'public-n');
  const output = join(root, 'public-n1');
  const bootstrapHandoff = join(root, 'bootstrap-input');
  const handoff = join(root, 'retention');
  const requestNPath = join(root, 'request-n.json');
  const builderResultN = join(root, 'builder-result-n.json');
  const requestN1Path = join(root, 'request-n1.json');
  const builderResultN1 = join(root, 'builder-result-n1.json');
  await cp(CANDIDATE, candidateN, { recursive: true });
  await cp(CANDIDATE, candidate, { recursive: true });
  const bootstrapRetention = {
    schema: 'bugdrop.retention-request/v1',
    mode: 'bootstrap',
    cutoverVersion: '1.55.0',
    expectedRetainedVersions: [],
    releases: [],
  };
  const inventoryN = buildReleaseInventory({
    compareUrl: 'https://github.test/compare/v1.54.0...n',
    pullRequests: [],
    commits: [{ sha: N_SHA, subject: 'N' }],
    changedPaths: ['src/widget/index.ts'],
  });
  const requestN = buildRequestPlan({
    dispatch: {
      repository: REPOSITORY,
      workflowRef: '.github/workflows/deploy.yml@refs/heads/main',
      targetSha: N_SHA,
      controllerSha: CONTROLLER,
      bump: 'minor',
      releaseReason: 'standard',
      rationale: '',
      operatorNotes: '',
      dryRun: true,
    },
    previousTag: 'v1.54.0',
    nextTag: 'v1.55.0',
    generatedNotes: inventoryN.generatedNotes,
    controllerSha: CONTROLLER,
    remoteMainSha: 'f'.repeat(40),
    inventory: inventoryN,
    retentionBootstrap: true,
    retention: bootstrapRetention,
    attestation: {
      previousReleaseSha: 'd'.repeat(40),
      candidateCommitTimestamp: '2026-08-01T00:00:00Z',
      candidateBehindMainBy: 0,
      expectedAliases: ['widget.js', 'widget.v1.js', 'widget.v1.55.js'],
      expectedAssetNames: ['widget.v1.55.0.js', 'versions.json'],
      verificationCommands: ['npm test'],
    },
  });
  await writeRetentionInput({
    root: bootstrapHandoff,
    requestIdentity: requestN.requestIdentity,
    retention: bootstrapRetention,
    assets: {},
  });
  await writeFile(requestNPath, `${canonicalize(requestN)}\n`);
  const runN = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts/build-widget.js'),
      '--mode',
      'release',
      '--source-dir',
      candidateN,
      '--output-dir',
      outputN,
      '--version',
      '1.55.0',
      '--timestamp',
      '2026-08-01T00:00:00Z',
      '--target-sha',
      N_SHA,
      '--repository',
      REPOSITORY,
      '--controller-identity',
      `sha256:${'1'.repeat(64)}`,
      '--tool-identity',
      `sha256:${'2'.repeat(64)}`,
      '--source-digest',
      '3'.repeat(64),
      '--retention-plan',
      join(bootstrapHandoff, 'retention-plan.json'),
      '--request-plan',
      requestNPath,
      '--result-path',
      builderResultN,
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  expect(runN.stderr).toBe('');
  expect(runN.status).toBe(0);
  const bundleN = await createState2BundleFromStaticPackage({
    requestPlan: requestN,
    staticPackageDir: outputN,
    builderResultPath: builderResultN,
    sourceDigests: { worker: '4'.repeat(64), lockfile: '5'.repeat(64) },
    toolchain: { esbuild: '0.28.0', wrangler: '4.98.0' },
    deploymentConfigDigest: '6'.repeat(64),
    verification: { contract: 'release-verification/v1', result: 'passed' },
  });
  const marker = buildPublicationMarker(bundleN.finalPlan);
  const legacySha = '7'.repeat(40);
  const tagObjectSha = '8'.repeat(40);
  const legacyTagObjectSha = '9'.repeat(40);
  const postBoundaryBundle = disabledV2WorkflowBundle({
    previousTag: 'v1.55.0',
    nextTag: 'v1.55.1',
    targetSha: legacySha,
    timestamp: '2026-08-01T12:00:00Z',
  });
  const postBoundaryMarker = buildPublicationMarker(postBoundaryBundle.finalPlan);
  const assetEntries = Object.entries(bundleN.assets).map(([name, bytes], index) => ({
    id: 1000 + index,
    name,
    url: `https://api.github.test/repos/${REPOSITORY}/releases/assets/${1000 + index}`,
    browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v1.55.0/${name}`,
    size: bytes.length,
  }));
  const postBoundaryAssetEntries = Object.entries(postBoundaryBundle.assets).map(
    ([name, bytes], index) => ({
      id: 2000 + index,
      name,
      url: `https://api.github.test/repos/${REPOSITORY}/releases/assets/${2000 + index}`,
      browser_download_url: `https://github.com/${REPOSITORY}/releases/download/v1.55.1/${name}`,
      size: bytes.length,
    })
  );
  const bytesById = Object.fromEntries([
    ...assetEntries.map(asset => [String(asset.id), bundleN.assets[asset.name]]),
    ...postBoundaryAssetEntries.map(asset => [
      String(asset.id),
      postBoundaryBundle.assets[asset.name],
    ]),
  ]);
  const request = async (path: string) => {
    if (path === `/repos/${REPOSITORY}/releases?per_page=100&page=1`)
      return {
        data: [
          {
            id: 55,
            tag_name: 'v1.55.0',
            draft: false,
            prerelease: false,
            published_at: '2026-08-01T00:00:00Z',
            html_url: 'https://github.test/releases/55',
            body: `<!-- bugdrop-publication ${Buffer.from(canonicalize(marker)).toString('base64url')} -->`,
            assets: assetEntries,
          },
          ...(postBoundaryLegacy
            ? [
                {
                  id: 56,
                  tag_name: 'v1.55.1',
                  draft: false,
                  prerelease: false,
                  published_at: '2026-08-01T12:00:00Z',
                  html_url: 'https://github.test/releases/56',
                  body: `<!-- bugdrop-publication ${Buffer.from(canonicalize(postBoundaryMarker)).toString('base64url')} -->`,
                  assets: postBoundaryAssetEntries,
                },
              ]
            : []),
        ],
        hasNext: false,
      };
    if (path === `/repos/${REPOSITORY}/git/matching-refs/tags/v?per_page=100&page=1`)
      return {
        data: [
          { ref: 'refs/tags/v1.55.0', object: { type: 'tag', sha: tagObjectSha } },
          ...(postBoundaryLegacy
            ? [
                {
                  ref: 'refs/tags/v1.55.1',
                  object: { type: 'tag', sha: legacyTagObjectSha },
                },
              ]
            : []),
        ],
        hasNext: false,
      };
    if (path === `/repos/${REPOSITORY}/git/tags/${tagObjectSha}`)
      return {
        data: {
          object: { type: 'commit', sha: N_SHA },
          message: `BugDrop v1.55.0\n\n${canonicalize(marker)}`,
        },
        hasNext: false,
      };
    if (path === `/repos/${REPOSITORY}/git/tags/${legacyTagObjectSha}`)
      return {
        data: {
          object: { type: 'commit', sha: legacySha },
          message: `BugDrop v1.55.1\n\n${canonicalize(postBoundaryMarker)}`,
        },
        hasNext: false,
      };
    if (path === `/repos/${REPOSITORY}/compare/${N_SHA}...${N1_SHA}`)
      return { data: { status: 'ahead' }, hasNext: false };
    if (path === `/repos/${REPOSITORY}/compare/${legacySha}...${N1_SHA}`)
      return { data: { status: 'ahead' }, hasNext: false };
    if (path === `/repos/${REPOSITORY}/commits/main`)
      return { data: { sha: N1_SHA }, hasNext: false };
    if (
      path ===
      `/repos/${REPOSITORY}/actions/runs?head_sha=${N1_SHA}&event=merge_group&per_page=100&page=1`
    )
      return {
        data: {
          workflow_runs: [
            {
              head_sha: N1_SHA,
              event: 'merge_group',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        },
        hasNext: false,
      };
    if (path === `/repos/${REPOSITORY}/commits/${N1_SHA}/pulls?per_page=100&page=1`)
      return { data: [], hasNext: false };
    throw new Error(`unexpected adapter request ${path}`);
  };
  const requestPlan = await createRequestPlanFromGithub({
    transport: createGithubTransport({
      token: 'offline-read-token',
      apiUrl: 'https://api.github.test',
      fetchImpl: async input => {
        const url = new URL(String(input));
        const assetMatch = /^\/repos\/mean-weasel\/bugdrop\/releases\/assets\/(\d+)$/.exec(
          url.pathname
        );
        if (url.origin === 'https://api.github.test' && assetMatch) {
          return new Response(null, {
            status: 302,
            headers: { location: `https://objects.githubusercontent.com/${assetMatch[1]}` },
          });
        }
        if (url.origin === 'https://objects.githubusercontent.com') {
          const bytes = bytesById[url.pathname.slice(1)];
          return new Response(bytes, {
            status: 200,
            headers: { 'content-length': String(bytes.length) },
          });
        }
        const result = await request(`${url.pathname}${url.search}`);
        return new Response(JSON.stringify(result.data), {
          status: 200,
          headers: result.hasNext ? { link: `<${url.href}&page=2>; rel="next"` } : undefined,
        });
      },
    }),
    context: {
      repositoryDir: candidate,
      retentionOutputDir: handoff,
      retentionBootstrap: false,
      dispatch: {
        repository: REPOSITORY,
        workflowRef: '.github/workflows/deploy.yml@refs/heads/main',
        targetSha: N1_SHA,
        controllerSha: CONTROLLER,
        bump: 'minor',
        releaseReason: 'standard',
        rationale: '',
        operatorNotes: '',
        dryRun: true,
      },
    },
    gitObserver: () => ({
      commits: [{ sha: N1_SHA, subject: 'N+1' }],
      changedPaths: ['src/widget/index.ts'],
      excludedNewerMainCommits: [],
      candidateCommitTimestamp: '2026-08-02T00:00:00Z',
      candidateBehindMainBy: 0,
      facts: {
        candidateRef: 'refs/heads/main',
        targetExists: true,
        targetReachableFromMain: true,
        controllerReachableFromMain: true,
        previousReleaseAncestor: true,
        targetStrictlyLater: true,
      },
    }),
  });
  const retainedN = await readFile(join(handoff, 'widget.v1.55.0.js'));
  await writeFile(requestN1Path, `${canonicalize(requestPlan)}\n`);
  const run = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts/build-widget.js'),
      '--mode',
      'release',
      '--source-dir',
      candidate,
      '--output-dir',
      output,
      '--version',
      '1.56.0',
      '--timestamp',
      '2026-08-02T00:00:00Z',
      '--target-sha',
      N1_SHA,
      '--repository',
      REPOSITORY,
      '--controller-identity',
      `sha256:${'1'.repeat(64)}`,
      '--tool-identity',
      `sha256:${'2'.repeat(64)}`,
      '--source-digest',
      '3'.repeat(64),
      '--retention-plan',
      join(handoff, 'retention-plan.json'),
      '--request-plan',
      requestN1Path,
      '--result-path',
      builderResultN1,
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  const common = {
    requestPlan,
    staticPackageDir: output,
    builderResultPath: builderResultN1,
    sourceDigests: { worker: '4'.repeat(64), lockfile: '5'.repeat(64) },
    toolchain: { esbuild: '0.28.0', wrangler: '4.98.0' },
    deploymentConfigDigest: '6'.repeat(64),
    verification: { contract: 'release-verification/v1', result: 'passed' },
  };
  return { output, common, retainedN };
}

async function rewriteChecksums(output: string) {
  const tree = await hashStaticTree(output);
  const bytes = `${Object.entries(tree.fileHashes)
    .filter(([path]) => path !== 'checksums.sha256')
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map(([path, hash]) => `${hash}  ${path}`)
    .join('\n')}\n`;
  await writeFile(join(output, 'checksums.sha256'), bytes);
}

describe('installed N/N+1 retention boundaries', () => {
  it('authenticates published v2 N through createGithubTransport, handoff, CLI, and real State 2', async () => {
    const { output, common, retainedN } = await vertical();
    const bundle = await createState2BundleFromStaticPackage(common);
    const manifest = JSON.parse(await readFile(join(output, 'versions.json'), 'utf8'));
    expect(await readFile(join(output, 'widget.v1.55.0.js'))).toEqual(retainedN);
    expect(manifest.schema).toBe('bugdrop.versions-manifest/v2');
    expect(manifest.artifacts['v1.55.0'].version).toBe('1.55.0');
    expect(manifest.artifacts['v1.56.0'].version).toBe('1.56.0');
    expect(manifest.artifacts['v1.55.0'].sha256).toBe(digest(retainedN));
    expect(bundle.releaseContent.staticPackage.fileHashes['widget.v1.55.0.js']).toBe(
      digest(retainedN)
    );
  });

  it('authenticates compact v2 continuation publication and canonical readback', async () => {
    const { common } = await vertical();
    const bundle = await createState2BundleFromStaticPackage(common);
    expect(bundle.requestPlan.retention.mode).toBe('continue');
    expect(bundle.finalPlan.requiredAssets).not.toContain('widget.v1.55.0.js');
    expect(bundle.finalPlan.requiredAssets).toEqual([
      'checksums.sha256',
      'final-release-plan.json',
      'release-content.json',
      'request-plan.json',
      'versions.json',
      'widget.v1.56.0.js',
    ]);
    expect(
      authenticatePublishedAssets({
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
      })
    ).toMatchObject({
      finalPlan: { planIdentity: bundle.finalPlan.planIdentity },
      requestPlan: { retention: { mode: 'continue' } },
      assetVerification: { complete: true, checksumsMatch: true },
    });
  });

  it('reacquires and replans an expired artifact with total identity equality', async () => {
    const first = await vertical();
    const reacquired = await vertical();
    const originalBundle = await createState2BundleFromStaticPackage(first.common);
    const rebuiltBundle = await createState2BundleFromStaticPackage(reacquired.common);
    expect(reacquired.retainedN).toEqual(first.retainedN);
    expect(rebuiltBundle.requestPlan).toEqual(originalBundle.requestPlan);
    expect(rebuiltBundle.releaseContent.staticPackage).toEqual(
      originalBundle.releaseContent.staticPackage
    );
    expect(rebuiltBundle.releaseContent.contentIdentity).toBe(
      originalBundle.releaseContent.contentIdentity
    );
    expect(rebuiltBundle.finalPlan.planIdentity).toBe(originalBundle.finalPlan.planIdentity);
    expect(
      resolveStaticArtifactRetry({
        artifactStatus: 'expired',
        expectedRequestIdentity: originalBundle.requestPlan.requestIdentity,
        expectedStaticPackageIdentity: originalBundle.releaseContent.staticPackage.contentIdentity,
        expectedContentIdentity: originalBundle.releaseContent.contentIdentity,
        expectedPlanIdentity: originalBundle.finalPlan.planIdentity,
        rebuiltRequestIdentity: rebuiltBundle.requestPlan.requestIdentity,
        rebuiltStaticPackageIdentity: rebuiltBundle.releaseContent.staticPackage.contentIdentity,
        rebuiltContentIdentity: rebuiltBundle.releaseContent.contentIdentity,
        rebuiltPlanIdentity: rebuiltBundle.finalPlan.planIdentity,
      })
    ).toMatchObject({
      kind: 'rebuilt-exact',
      requestIdentity: originalBundle.requestPlan.requestIdentity,
      staticPackageIdentity: originalBundle.releaseContent.staticPackage.contentIdentity,
      contentIdentity: originalBundle.releaseContent.contentIdentity,
      planIdentity: originalBundle.finalPlan.planIdentity,
    });
  });

  it('rejects retained-byte substitution before State 2', async () => {
    const { output, common } = await vertical();
    const pristine = await createState2BundleFromStaticPackage(common);
    await writeFile(join(output, 'widget.v1.55.0.js'), 'substituted');
    await rewriteChecksums(output);
    await expect(createState2BundleFromStaticPackage(common)).rejects.toThrow(
      /BUILDER_RESULT_MISMATCH/
    );
    await expect(
      buildExpectedLive({
        bundle: pristine,
        origin: 'https://bugdrop.example',
        staticPackageDir: output,
      })
    ).rejects.toThrow(/STATIC_TREE_MISMATCH/);
  });

  it('rejects a checksum-consistent current alias substitution at installed State 2', async () => {
    const { output, common } = await vertical();
    await writeFile(join(output, 'widget.js'), 'substituted alias');
    await rewriteChecksums(output);
    await expect(createState2BundleFromStaticPackage(common)).rejects.toThrow(
      /BUILDER_RESULT_MISMATCH/
    );
  });

  it.each([
    ['added', async (output: string) => writeFile(join(output, 'injected.txt'), 'injected')],
    ['removed', async (output: string) => rm(join(output, 'widget.v1.55.0.js'))],
  ])(
    'rejects a checksum-consistent file that was %s after the builder result',
    async (_kind, mutate) => {
      const { output, common } = await vertical();
      await mutate(output);
      await rewriteChecksums(output);
      await expect(createState2BundleFromStaticPackage(common)).rejects.toThrow(
        /BUILDER_RESULT_MISMATCH/
      );
    }
  );

  it('rejects an observed legacy stable Release after the authenticated boundary', async () => {
    await expect(vertical({ postBoundaryLegacy: true })).rejects.toThrow(
      /RETENTION_HISTORY_INCOMPLETE/
    );
  });
});
