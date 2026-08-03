const API_VERSION = '2022-11-28';
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TAG = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const SHA = /^[0-9a-f]{40}$/;
const ASSET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
const RELEASE_ID = /^[1-9]\d*$/;
const TOKEN = /^[A-Za-z0-9_.-]{16,4096}$/;

export class GithubPublicationAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    Object.assign(this, { code, details, name: 'GithubPublicationAdapterError' });
  }
}

function fail(code, message, details) {
  throw new GithubPublicationAdapterError(code, message, details);
}

function match(value, pattern, field) {
  if (!pattern.test(value ?? '')) fail('INVALID_INPUT', `${field} is invalid`);
  return value;
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_RESPONSE', `${field} response is invalid`);
  }
  return value;
}

function marker(body) {
  const matches = [
    ...String(body ?? '').matchAll(/<!-- bugdrop-publication ([A-Za-z0-9_-]+) -->/g),
  ];
  if (matches.length === 0) return { bodyMarker: null, marker: null };
  if (matches.length !== 1) fail('INVALID_RESPONSE', 'release body has ambiguous markers');
  try {
    const value = JSON.parse(Buffer.from(matches[0][1], 'base64url').toString('utf8'));
    return { bodyMarker: matches[0][0], marker: value };
  } catch {
    fail('INVALID_RESPONSE', 'release marker is invalid');
  }
}

function endpoint(base, path) {
  const url = new URL(path, `${base.replace(/\/$/, '')}/`);
  if (url.origin !== new URL(base).origin) fail('UNSAFE_ENDPOINT', 'request left trusted origin');
  return url;
}

export function createGithubPublicationAdapter({
  apiUrl = 'https://api.github.com',
  fetchImpl = fetch,
  repository,
  token,
  uploadsUrl = 'https://uploads.github.com',
}) {
  if (
    !REPOSITORY.test(repository ?? '') ||
    repository.split('/').some(part => part.startsWith('.') || part.includes('..'))
  ) {
    fail('INVALID_INPUT', 'repository is invalid');
  }
  if (!TOKEN.test(token ?? '')) fail('TOKEN_REQUIRED', 'token is required');
  const headers = accept => ({
    accept,
    authorization: `Bearer ${token}`,
    'x-github-api-version': API_VERSION,
  });
  const request = async (method, path, options = {}) => {
    const url = endpoint(options.base ?? apiUrl, path);
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: 'error',
        headers: {
          ...headers('application/vnd.github+json'),
          ...(options.body === undefined
            ? {}
            : { 'content-type': options.contentType ?? 'application/json' }),
        },
        ...(options.body === undefined
          ? {}
          : {
              body:
                options.contentType === 'application/octet-stream'
                  ? options.body
                  : JSON.stringify(options.body),
            }),
      });
    } catch {
      fail('GITHUB_REQUEST_FAILED', 'GitHub request failed', {
        method,
        path: url.pathname,
        status: null,
      });
    }
    if (options.missing && response.status === 404) return null;
    if (!(options.expected ?? [200, 201]).includes(response.status)) {
      fail('GITHUB_REQUEST_FAILED', 'GitHub request failed', {
        method,
        path: url.pathname,
        status: response.status,
      });
    }
    if (response.status === 204) return null;
    try {
      return record(await response.json(), url.pathname);
    } catch (error) {
      if (error instanceof GithubPublicationAdapterError) throw error;
      fail('INVALID_RESPONSE', `${url.pathname} did not return JSON`);
    }
  };
  const requestBytes = async assetUrl => {
    const url = new URL(assetUrl);
    if (url.origin !== new URL(apiUrl).origin)
      fail('UNSAFE_ENDPOINT', 'asset API URL is untrusted');
    let response;
    try {
      response = await fetchImpl(url, {
        headers: headers('application/octet-stream'),
        redirect: 'manual',
      });
    } catch {
      fail('GITHUB_REQUEST_FAILED', 'GitHub asset request failed', { status: null });
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location?.startsWith('https://')) fail('UNSAFE_ENDPOINT', 'asset redirect is untrusted');
      try {
        response = await fetchImpl(location, {
          headers: { accept: 'application/octet-stream' },
          redirect: 'error',
        });
      } catch {
        fail('GITHUB_REQUEST_FAILED', 'GitHub asset request failed', { status: null });
      }
    }
    if (!response.ok)
      fail('GITHUB_REQUEST_FAILED', 'GitHub asset request failed', { status: response.status });
    return Buffer.from(await response.arrayBuffer());
  };
  const inspectTag = async tag => {
    const ref = await request(
      'GET',
      `/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`,
      {
        missing: true,
      }
    );
    if (!ref) return { tagObject: null, tagRef: null };
    if (ref.object?.type !== 'tag' || !SHA.test(ref.object?.sha ?? '')) {
      fail('INVALID_RESPONSE', 'tag ref is not an annotated tag');
    }
    const object = await request('GET', `/repos/${repository}/git/tags/${ref.object.sha}`);
    if (object.object?.type !== 'commit' || !SHA.test(object.object?.sha ?? '')) {
      fail('INVALID_RESPONSE', 'annotated tag target is invalid');
    }
    return {
      tagRef: { objectSha: ref.object.sha },
      tagObject: {
        annotation: String(object.message ?? ''),
        kind: 'annotated',
        objectSha: ref.object.sha,
        targetSha: object.object.sha,
        targetType: 'commit',
      },
    };
  };
  const inspect = async requestedTag => {
    const tag = match(requestedTag, TAG, 'tag');
    const tagState = await inspectTag(tag);
    const release = await request(
      'GET',
      `/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
      {
        missing: true,
      }
    );
    const releases = [];
    if (release) {
      if (release.tag_name !== tag || !RELEASE_ID.test(String(release.id ?? ''))) {
        fail('INVALID_RESPONSE', 'release identity is invalid');
      }
      if (!Array.isArray(release.assets)) fail('INVALID_RESPONSE', 'release assets are incomplete');
      const assets = [];
      for (const asset of release.assets) {
        if (!ASSET.test(asset?.name ?? '') || typeof asset?.url !== 'string') {
          fail('INVALID_RESPONSE', 'release asset identity is invalid');
        }
        assets.push({ name: asset.name, bytes: await requestBytes(asset.url) });
      }
      releases.push({
        ...marker(release.body),
        assets,
        body: String(release.body ?? ''),
        draft: release.draft === true,
        id: String(release.id),
        prerelease: release.prerelease === true,
        published: release.draft === false && release.published_at !== null,
        tag,
        targetSha: tagState.tagObject?.targetSha,
      });
    }
    return { complete: true, ...tagState, releases };
  };
  return {
    inspect,
    async createAnnotatedTag(action) {
      const tag = match(action.tag, TAG, 'tag');
      const targetSha = match(action.targetSha, SHA, 'targetSha');
      const created = await request('POST', `/repos/${repository}/git/tags`, {
        body: { tag, message: String(action.annotation ?? ''), object: targetSha, type: 'commit' },
      });
      const objectSha = match(created.sha, SHA, 'tag object SHA');
      await request('POST', `/repos/${repository}/git/refs`, {
        body: { ref: `refs/tags/${tag}`, sha: objectSha },
      });
    },
    async createDraft(action) {
      await request('POST', `/repos/${repository}/releases`, {
        body: {
          body: String(action.body ?? ''),
          draft: true,
          generate_release_notes: false,
          name: String(action.name ?? ''),
          prerelease: false,
          tag_name: match(action.tag, TAG, 'tag'),
          target_commitish: match(action.targetSha, SHA, 'targetSha'),
        },
      });
    },
    async uploadAsset(action) {
      const releaseId = match(String(action.releaseId ?? ''), RELEASE_ID, 'releaseId');
      const name = match(action.name, ASSET, 'asset name');
      if (!Buffer.isBuffer(action.bytes)) fail('INVALID_INPUT', 'asset bytes are required');
      await request(
        'POST',
        `/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
        {
          base: uploadsUrl,
          body: action.bytes,
          contentType: 'application/octet-stream',
        }
      );
    },
    async publishDraft(action) {
      const releaseId = match(String(action.releaseId ?? ''), RELEASE_ID, 'releaseId');
      await request('PATCH', `/repos/${repository}/releases/${releaseId}`, {
        body: { draft: false },
      });
    },
  };
}
