#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalize } from './canonical-json.mjs';
import { observeGitRange } from './git-observer.mjs';
import {
  buildReleaseInventory,
  buildRequestPlan,
  calculateNextTag,
  findCompletedPlan,
  normalizeDispatch,
  normalizeGithubState,
  publishedFrontier,
  validateSourceContext,
} from './plan.mjs';
import { validatePublicationBundle } from './publication.mjs';

const API_VERSION = '2022-11-28';
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export class GithubAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, details, name: 'GithubAdapterError' });
  }
}

function fail(code, message, details) {
  throw new GithubAdapterError(code, message, details);
}

function assertInput(repository, targetSha) {
  const segments = typeof repository === 'string' ? repository.split('/') : [];
  if (
    !REPOSITORY_PATTERN.test(repository ?? '') ||
    segments.some(segment => segment.startsWith('.') || segment.includes('..'))
  ) {
    fail('INVALID_REPOSITORY', 'repository must be owner/name');
  }
  if (!SHA_PATTERN.test(targetSha ?? '')) {
    fail('INVALID_TARGET_SHA', 'targetSha must be a full lowercase SHA');
  }
}

export function createGithubTransport({
  token,
  fetchImpl = fetch,
  apiUrl = 'https://api.github.com',
}) {
  if (typeof token !== 'string' || !token) fail('TOKEN_REQUIRED', 'an explicit token is required');
  return {
    async request(path) {
      const response = await fetchImpl(new URL(path, `${apiUrl.replace(/\/$/, '')}/`), {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${token}`,
          'x-github-api-version': API_VERSION,
        },
        redirect: 'error',
      });
      if (!response.ok) {
        fail('GITHUB_API_FAILED', `GitHub API returned ${response.status}`, {
          path: new URL(path, apiUrl).pathname,
          status: response.status,
        });
      }
      let data;
      try {
        data = await response.json();
      } catch {
        fail('GITHUB_API_INVALID_JSON', 'GitHub API response was not JSON');
      }
      return { data, hasNext: /<[^>]+>;\s*rel="next"/.test(response.headers.get('link') ?? '') };
    },
    async requestBytes(path) {
      let response = await fetchImpl(new URL(path, `${apiUrl.replace(/\/$/, '')}/`), {
        headers: {
          accept: 'application/octet-stream',
          authorization: `Bearer ${token}`,
          'x-github-api-version': API_VERSION,
        },
        redirect: 'manual',
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location?.startsWith('https://')) {
          fail('GITHUB_ASSET_FAILED', 'GitHub asset redirect is not trusted HTTPS');
        }
        response = await fetchImpl(location, {
          headers: { accept: 'application/octet-stream' },
          redirect: 'error',
        });
      }
      if (!response.ok) {
        fail('GITHUB_ASSET_FAILED', `GitHub asset returned ${response.status}`, {
          status: response.status,
        });
      }
      return Buffer.from(await response.arrayBuffer());
    },
  };
}

export async function paginateGithub(transport, path, { perPage = 100, maxPages = 100 } = {}) {
  const records = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const result = await transport.request(`${path}${separator}per_page=${perPage}&page=${page}`);
    if (!Array.isArray(result?.data)) {
      fail('GITHUB_API_INCOMPLETE', `${path} did not return an array`);
    }
    records.push(...result.data);
    if (result.hasNext === false) return records;
    if (result.hasNext !== true) {
      fail('GITHUB_API_INCOMPLETE', `${path} omitted pagination authority`);
    }
  }
  fail('GITHUB_API_INCOMPLETE', `${path} exceeded ${maxPages} pages`);
}

function decodeMarker(body) {
  const matches = [
    ...String(body ?? '').matchAll(/<!-- bugdrop-publication ([A-Za-z0-9_-]+) -->/g),
  ];
  if (matches.length === 0) return null;
  if (matches.length !== 1) fail('AMBIGUOUS_MARKER', 'release body has multiple identity markers');
  try {
    return JSON.parse(Buffer.from(matches[0][1], 'base64url').toString('utf8'));
  } catch {
    fail('INVALID_MARKER', 'release body identity marker is invalid');
  }
}

function canonicalAsset(assets, name) {
  const bytes = assets?.[name];
  if (!Buffer.isBuffer(bytes)) fail('PUBLISHED_ASSET_MISSING', `${name} is unavailable`);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('PUBLISHED_ASSET_INVALID', `${name} is not JSON`);
  }
  if (!bytes.equals(Buffer.from(`${canonicalize(value)}\n`))) {
    fail('PUBLISHED_ASSET_INVALID', `${name} is not canonical`);
  }
  return value;
}

export function authenticatePublishedAssets({ release, assets }) {
  if (release?.published !== true || release.draft !== false || release.prerelease !== false) {
    fail('PUBLISHED_RELEASE_INVALID', 'completed-plan assets must belong to a stable publication');
  }
  const requestPlan = canonicalAsset(assets, 'request-plan.json');
  const releaseContent = canonicalAsset(assets, 'release-content.json');
  const finalPlan = canonicalAsset(assets, 'final-release-plan.json');
  let expected;
  try {
    expected = validatePublicationBundle({ requestPlan, releaseContent, finalPlan, assets });
  } catch (error) {
    fail('PUBLISHED_ASSET_INVALID', 'published assets do not authenticate', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (
    release.tag !== expected.tag ||
    release.targetSha !== expected.targetSha ||
    release.resolvedTagSha !== expected.targetSha ||
    canonicalize(release.marker) !== canonicalize(expected.marker)
  ) {
    fail('PUBLISHED_RELEASE_CONFLICT', 'published tag, target, or marker differs from its assets');
  }
  return {
    ...release,
    requestPlan,
    releaseContent,
    finalPlan,
    marker: expected.marker,
    assetVerification: {
      complete: true,
      checksumsMatch: true,
      unexpectedConflicts: false,
      planIdentity: expected.planIdentity,
      contentIdentity: expected.marker.contentIdentity,
      verifiedAssetNames: expected.requiredAssets,
    },
  };
}

export async function loadPublishedReleaseAssets({ transport, release }) {
  if (!Array.isArray(release?.assets) || release.assets.length === 0) {
    fail('PUBLISHED_ASSET_MISSING', 'published Release has no inspectable assets');
  }
  const assets = {};
  for (const asset of release.assets) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(asset?.name ?? '') ||
      typeof asset?.apiUrl !== 'string' ||
      !asset.apiUrl.startsWith('https://') ||
      Object.hasOwn(assets, asset.name)
    ) {
      fail('PUBLISHED_ASSET_INVALID', 'published Release asset metadata is invalid');
    }
    assets[asset.name] = await transport.requestBytes(asset.apiUrl);
  }
  return authenticatePublishedAssets({ release, assets });
}

function tagName(ref) {
  const prefix = 'refs/tags/';
  if (typeof ref !== 'string' || !ref.startsWith(prefix)) {
    fail('INVALID_TAG_REF', 'matching-ref response contains an invalid ref');
  }
  return ref.slice(prefix.length);
}

async function resolveTag(transport, repository, ref) {
  const tag = tagName(ref.ref);
  const object = ref.object;
  if (!SHA_PATTERN.test(object?.sha ?? '') || !['commit', 'tag'].includes(object?.type)) {
    fail('INVALID_TAG_REF', `${tag} has an invalid Git object`);
  }
  if (object.type === 'commit') {
    return { tag, sha: object.sha, kind: 'lightweight', marker: null };
  }
  const result = await transport.request(`/repos/${repository}/git/tags/${object.sha}`);
  const target = result?.data?.object;
  if (
    result?.hasNext !== false ||
    target?.type !== 'commit' ||
    !SHA_PATTERN.test(target?.sha ?? '')
  ) {
    fail('INVALID_ANNOTATED_TAG', `${tag} does not resolve exactly to a commit`);
  }
  const annotation = String(result.data.message ?? '');
  const markerText = annotation.split('\n\n').at(-1);
  let marker = null;
  try {
    marker = JSON.parse(markerText);
  } catch {
    // Historical annotated tags do not need a BugDrop marker.
  }
  return { tag, sha: target.sha, kind: 'annotated', annotation, marker };
}

async function relationToTarget(transport, repository, releaseSha, targetSha) {
  const result = await transport.request(
    `/repos/${repository}/compare/${releaseSha}...${targetSha}`
  );
  if (result?.hasNext !== false) fail('GITHUB_API_INCOMPLETE', 'compare response was paginated');
  if (['ahead', 'identical'].includes(result?.data?.status)) return 'ancestor';
  if (result?.data?.status === 'behind') return 'descendant';
  fail('DIVERGENT_RELEASE_HISTORY', 'published release and candidate histories diverge');
}

export async function observeGithubState({ transport, repository, targetSha }) {
  assertInput(repository, targetSha);
  const [rawReleases, rawRefs] = await Promise.all([
    paginateGithub(transport, `/repos/${repository}/releases`),
    paginateGithub(transport, `/repos/${repository}/git/matching-refs/tags/v`),
  ]);
  const refs = await Promise.all(rawRefs.map(ref => resolveTag(transport, repository, ref)));
  const refByTag = new Map(refs.map(ref => [ref.tag, ref]));
  const releases = [];
  for (const release of rawReleases) {
    const tag = release?.tag_name;
    const ref = refByTag.get(tag);
    if (!TAG_PATTERN.test(tag ?? '') || !ref || typeof release?.draft !== 'boolean') {
      fail('INVALID_RELEASE', 'release list contains an unresolved or invalid stable tag');
    }
    const published = release.draft === false && release.published_at !== null;
    releases.push({
      id: String(release.id ?? ''),
      tag,
      targetSha: ref.sha,
      draft: release.draft,
      prerelease: release.prerelease === true,
      published,
      url: String(release.html_url ?? ''),
      assets: (release.assets ?? []).map(asset => ({
        name: String(asset?.name ?? ''),
        apiUrl: String(asset?.url ?? ''),
      })),
      marker: decodeMarker(release.body),
      relationToTarget:
        published && release.prerelease !== true
          ? await relationToTarget(transport, repository, ref.sha, targetSha)
          : undefined,
    });
  }
  return normalizeGithubState({ apiComplete: true, refs, releases });
}

async function requestRecord(transport, path, field) {
  const result = await transport.request(path);
  if (result?.hasNext !== false || !result?.data || typeof result.data !== 'object') {
    fail('GITHUB_API_INCOMPLETE', `${field} response is incomplete`);
  }
  return result.data;
}

async function observePullRequests(transport, repository, commits) {
  const pulls = new Map();
  for (const commit of commits) {
    const records = await paginateGithub(
      transport,
      `/repos/${repository}/commits/${commit.sha}/pulls`
    );
    for (const pull of records) {
      if (!Number.isSafeInteger(pull?.number) || !SHA_PATTERN.test(pull?.merge_commit_sha ?? '')) {
        fail('GITHUB_API_INCOMPLETE', 'associated pull request identity is incomplete');
      }
      pulls.set(pull.number, {
        number: pull.number,
        title: String(pull.title ?? ''),
        url: String(pull.html_url ?? ''),
        sha: pull.merge_commit_sha,
        labels: (pull.labels ?? []).map(label => String(label?.name ?? '')),
      });
    }
  }
  return [...pulls.values()];
}

export async function observeMergeQueuePreflight(transport, repository, targetSha) {
  const records = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await transport.request(
      `/repos/${repository}/actions/runs?head_sha=${targetSha}&event=merge_group&per_page=100&page=${page}`
    );
    if (!Array.isArray(result?.data?.workflow_runs)) {
      fail('GITHUB_API_INCOMPLETE', 'merge-queue workflow response is incomplete');
    }
    records.push(...result.data.workflow_runs);
    if (result.hasNext === false) break;
    if (result.hasNext !== true || page === 100) {
      fail('GITHUB_API_INCOMPLETE', 'merge-queue workflow pagination is incomplete');
    }
  }
  return (
    records.length > 0 &&
    records.every(
      run =>
        run?.head_sha === targetSha &&
        run?.event === 'merge_group' &&
        run?.status === 'completed' &&
        run?.conclusion === 'success'
    )
  );
}

export async function createRequestPlanFromGithub({
  transport,
  context,
  gitObserver = observeGitRange,
}) {
  const dispatch = normalizeDispatch(context?.dispatch);
  assertInput(dispatch.repository, dispatch.targetSha);
  const state = await observeGithubState({
    transport,
    repository: dispatch.repository,
    targetSha: dispatch.targetSha,
  });
  const exactPublished = state.releases.filter(
    release =>
      release.published &&
      !release.draft &&
      !release.prerelease &&
      release.targetSha === dispatch.targetSha
  );
  if (exactPublished.length > 1) {
    fail('COMPLETED_PLAN_AMBIGUOUS', 'multiple published Releases target this candidate');
  }
  if (exactPublished.length === 1) {
    const hydrated = await loadPublishedReleaseAssets({
      transport,
      release: exactPublished[0],
    });
    const completed = findCompletedPlan({
      dispatch,
      releases: [hydrated],
      containsTarget: () => false,
    });
    return {
      status: 'completed',
      planIdentity: completed.planIdentity,
      tag: hydrated.tag,
      targetSha: hydrated.targetSha,
    };
  }
  const frontier = publishedFrontier(state);
  if (!frontier) fail('FRONTIER_MISSING', 'no stable published Release is available');
  const [remoteMain, preflightSuccessful] = await Promise.all([
    requestRecord(transport, `/repos/${dispatch.repository}/commits/main`, 'remote main'),
    observeMergeQueuePreflight(transport, dispatch.repository, dispatch.targetSha),
  ]);
  const git = gitObserver({
    repositoryDir: context.repositoryDir,
    previousSha: frontier.targetSha,
    targetSha: dispatch.targetSha,
    mainSha: remoteMain.sha,
    controllerSha: dispatch.controllerSha,
  });
  const inventory = buildReleaseInventory({
    compareUrl: `https://github.com/${dispatch.repository}/compare/${frontier.tag}...${dispatch.targetSha}`,
    pullRequests: await observePullRequests(transport, dispatch.repository, git.commits),
    commits: git.commits,
    changedPaths: git.changedPaths,
    excludedNewerMainCommits: git.excludedNewerMainCommits,
  });
  validateSourceContext(dispatch, {
    ...git.facts,
    laterReleaseContainsTarget: state.published.some(
      release => release.relationToTarget === 'descendant'
    ),
    preflightSuccessful,
  });
  const nextTag = calculateNextTag(frontier.tag, dispatch.bump);
  const [major, minor] = nextTag.slice(1).split('.');
  return buildRequestPlan({
    dispatch,
    previousTag: frontier.tag,
    nextTag,
    generatedNotes: inventory.generatedNotes,
    controllerSha: dispatch.controllerSha,
    remoteMainSha: remoteMain.sha,
    inventory,
    attestation: {
      previousReleaseSha: frontier.targetSha,
      candidateCommitTimestamp: git.candidateCommitTimestamp,
      candidateBehindMainBy: git.candidateBehindMainBy,
      expectedAliases: ['widget.js', `widget.v${major}.js`, `widget.v${major}.${minor}.js`],
      expectedAssetNames: [`widget.${nextTag}.js`, 'versions.json'],
      verificationCommands: ['npm run validate', 'npm run build'],
    },
  });
}

async function runCli() {
  const [mode, inputPath] = process.argv.slice(2);
  if (!['observe', 'plan'].includes(mode) || !inputPath) {
    fail('INVALID_CLI', 'usage: github-adapter.mjs observe|plan INPUT.json');
  }
  const input = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
  const token = process.env.BUGDROP_GITHUB_TOKEN;
  const transport = createGithubTransport({ token, apiUrl: input.apiUrl });
  const output =
    mode === 'observe'
      ? await observeGithubState({ ...input, transport })
      : await createRequestPlanFromGithub({ context: input, transport });
  process.stdout.write(`${canonicalize(output)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
