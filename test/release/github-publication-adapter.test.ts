import { describe, expect, it, vi } from 'vitest';

import {
  GithubPublicationAdapterError,
  createGithubPublicationAdapter,
} from '../../scripts/release/github-publication-adapter.mjs';

const SHA = '1'.repeat(40);
const TAG_OBJECT_SHA = '2'.repeat(40);
const API = 'https://api.example.test';
const UPLOADS = 'https://uploads.example.test';
const TOKEN = 'github_token_123456789';

function response(value: unknown, status = 200, headers?: HeadersInit) {
  return new Response(value === null ? null : JSON.stringify(value), { status, headers });
}

function adapter(fetchImpl: typeof fetch) {
  return createGithubPublicationAdapter({
    apiUrl: API,
    uploadsUrl: UPLOADS,
    fetchImpl,
    repository: 'mean-weasel/bugdrop',
    token: TOKEN,
  });
}

describe('GitHub publication inspection', () => {
  it('hydrates one annotated tag, marker, and exact asset bytes', async () => {
    const marker = { planIdentity: `sha256:${'3'.repeat(64)}` };
    const bodyMarker = `<!-- bugdrop-publication ${Buffer.from(JSON.stringify(marker)).toString('base64url')} -->`;
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/git/ref/tags/v1.2.3')) {
        return response({ object: { type: 'tag', sha: TAG_OBJECT_SHA } });
      }
      if (url.pathname.endsWith(`/git/tags/${TAG_OBJECT_SHA}`)) {
        return response({ message: 'annotation', object: { type: 'commit', sha: SHA } });
      }
      if (url.pathname.endsWith('/releases') && url.searchParams.get('page') === '1') {
        return response([
          {
            id: 123,
            tag_name: 'v1.2.3',
            body: `notes\n\n${bodyMarker}`,
            draft: false,
            prerelease: false,
            published_at: '2026-08-03T12:00:00Z',
            assets: [
              {
                id: 7,
                name: 'widget.v1.2.3.js',
                url: `${API}/repos/mean-weasel/bugdrop/releases/assets/7`,
                size: Buffer.byteLength('widget-bytes'),
              },
            ],
          },
        ]);
      }
      if (url.pathname === '/repos/mean-weasel/bugdrop/releases/assets/7') {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://objects.githubusercontent.com/widget' },
        });
      }
      if (url.origin === 'https://objects.githubusercontent.com') {
        return new Response(Buffer.from('widget-bytes'));
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    await expect(adapter(fetchImpl).inspect('v1.2.3')).resolves.toEqual({
      complete: true,
      tagRef: { objectSha: TAG_OBJECT_SHA },
      tagObject: {
        annotation: 'annotation',
        kind: 'annotated',
        objectSha: TAG_OBJECT_SHA,
        targetSha: SHA,
        targetType: 'commit',
      },
      releases: [
        {
          assets: [{ name: 'widget.v1.2.3.js', bytes: Buffer.from('widget-bytes') }],
          body: `notes\n\n${bodyMarker}`,
          bodyMarker,
          draft: false,
          id: '123',
          marker,
          prerelease: false,
          published: true,
          tag: 'v1.2.3',
          targetSha: SHA,
        },
      ],
    });
    for (const call of fetchImpl.mock.calls.slice(0, 4)) {
      expect(new Headers(call[1]?.headers).get('authorization')).toBe(`Bearer ${TOKEN}`);
    }
    expect(new Headers(fetchImpl.mock.calls[4][1]?.headers).get('authorization')).toBeNull();
  });

  it('returns a complete empty observation for an unused tag', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      return url.pathname.endsWith('/releases')
        ? response([])
        : response({ message: 'Not Found' }, 404);
    });
    await expect(adapter(fetchImpl).inspect('v9.9.9')).resolves.toEqual({
      complete: true,
      tagObject: null,
      tagRef: null,
      releases: [],
    });
  });

  it('observes drafts that the release-by-tag endpoint omits', async () => {
    const publicationMarker = { planIdentity: `sha256:${'4'.repeat(64)}` };
    const bodyMarker = `<!-- bugdrop-publication ${Buffer.from(JSON.stringify(publicationMarker)).toString('base64url')} -->`;
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/git/ref/tags/v1.2.3')) {
        return response({ object: { type: 'tag', sha: TAG_OBJECT_SHA } });
      }
      if (url.pathname.endsWith(`/git/tags/${TAG_OBJECT_SHA}`)) {
        return response({ message: 'annotation', object: { type: 'commit', sha: SHA } });
      }
      if (url.pathname.endsWith('/releases')) {
        return response([
          {
            id: 456,
            tag_name: 'v1.2.3',
            body: bodyMarker,
            draft: true,
            prerelease: false,
            published_at: null,
            assets: [],
          },
        ]);
      }
      throw new Error(`unexpected ${url.pathname}`);
    });

    await expect(adapter(fetchImpl).inspect('v1.2.3')).resolves.toMatchObject({
      complete: true,
      releases: [
        {
          id: '456',
          draft: true,
          published: false,
          marker: publicationMarker,
          tag: 'v1.2.3',
          targetSha: SHA,
        },
      ],
    });
    expect(fetchImpl).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: expect.stringContaining('/releases/tags/') }),
      expect.anything()
    );
  });

  it('uses pagination authority and accepts an exactly full final bounded page', async () => {
    let releasePageCalls = 0;
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/releases')) {
        releasePageCalls += 1;
        const page = Number(url.searchParams.get('page'));
        return response(
          Array.from({ length: 100 }, (_, index) => ({
            id: page * 100 + index,
            tag_name: 'v1.2.2',
          })),
          200,
          page < 100
            ? { link: `<${API}/repos/mean-weasel/bugdrop/releases?page=${page + 1}>; rel="next"` }
            : undefined
        );
      }
      return response({ message: 'Not Found' }, 404);
    });

    await expect(adapter(fetchImpl).inspect('v1.2.3')).resolves.toMatchObject({
      complete: true,
      releases: [],
    });
    expect(releasePageCalls).toBe(100);
  });

  it('reports duplicate same-tag identities without downloading their assets', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/releases')) {
        return response(
          [501, 502].map(id => ({
            id,
            tag_name: 'v1.2.3',
            assets: [
              {
                id: id + 100,
                name: 'large.zip',
                size: 1024,
                url: `${API}/repos/mean-weasel/bugdrop/releases/assets/${id + 100}`,
              },
            ],
          }))
        );
      }
      if (url.pathname.includes('/releases/assets/')) {
        throw new Error('duplicate assets must not be downloaded');
      }
      return response({ message: 'Not Found' }, 404);
    });

    await expect(adapter(fetchImpl).inspect('v1.2.3')).resolves.toMatchObject({
      complete: true,
      releases: [
        { id: '501', tag: 'v1.2.3' },
        { id: '502', tag: 'v1.2.3' },
      ],
    });
    expect(
      fetchImpl.mock.calls.some(([input]) => new URL(String(input)).pathname.includes('/assets/'))
    ).toBe(false);
  });
});

describe('GitHub publication mutations', () => {
  it('creates an annotated tag object and exact ref', async () => {
    const calls: Array<{ body: unknown; method: string; path: string }> = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? 'GET',
        path: url.pathname,
      });
      return url.pathname.endsWith('/git/tags')
        ? response({ sha: TAG_OBJECT_SHA }, 201)
        : response({ ref: 'refs/tags/v1.2.3' }, 201);
    });
    await adapter(fetchImpl).createAnnotatedTag({
      tag: 'v1.2.3',
      targetSha: SHA,
      annotation: 'exact annotation',
    });
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/repos/mean-weasel/bugdrop/git/tags',
        body: { tag: 'v1.2.3', message: 'exact annotation', object: SHA, type: 'commit' },
      },
      {
        method: 'POST',
        path: '/repos/mean-weasel/bugdrop/git/refs',
        body: { ref: 'refs/tags/v1.2.3', sha: TAG_OBJECT_SHA },
      },
    ]);
  });

  it('creates a draft, uploads exact bytes, then publishes', async () => {
    const calls: Array<{
      body: BodyInit | null | undefined;
      contentType: string | null;
      method: string;
      url: string;
    }> = [];
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({
        body: init?.body,
        contentType: new Headers(init?.headers).get('content-type'),
        method: init?.method ?? 'GET',
        url: url.toString(),
      });
      return response({ id: 123 }, 201);
    });
    const client = adapter(fetchImpl);
    await client.createDraft({
      tag: 'v1.2.3',
      targetSha: SHA,
      name: 'BugDrop 1.2.3',
      body: 'notes',
    });
    await client.uploadAsset({ releaseId: '123', name: 'widget.js', bytes: Buffer.from('asset') });
    await client.publishDraft({ releaseId: '123' });
    expect(calls.map(call => [call.method, call.url])).toEqual([
      ['POST', `${API}/repos/mean-weasel/bugdrop/releases`],
      ['POST', `${UPLOADS}/repos/mean-weasel/bugdrop/releases/123/assets?name=widget.js`],
      ['PATCH', `${API}/repos/mean-weasel/bugdrop/releases/123`],
    ]);
    expect(calls[1]).toMatchObject({ contentType: 'application/octet-stream' });
    expect(Buffer.from(calls[1].body as Uint8Array).toString()).toBe('asset');
  });

  it('sanitizes failures without response bodies, tokens, or query values', async () => {
    const fetchImpl = vi.fn(async () => response({ token: TOKEN, bytes: 'private' }, 500));
    let failure: unknown;
    try {
      await adapter(fetchImpl).uploadAsset({
        releaseId: '123',
        name: 'widget.js',
        bytes: Buffer.from('asset'),
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(GithubPublicationAdapterError);
    expect(JSON.stringify(failure)).not.toContain(TOKEN);
    expect(JSON.stringify(failure)).not.toContain('widget.js');
    expect(JSON.stringify(failure)).not.toContain('private');
  });

  it('sanitizes thrown transport failures', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`transport leaked ${TOKEN} widget.js`);
    });
    let failure: unknown;
    try {
      await adapter(fetchImpl).createDraft({
        tag: 'v1.2.3',
        targetSha: SHA,
        name: 'BugDrop 1.2.3',
        body: 'notes',
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(GithubPublicationAdapterError);
    expect(JSON.stringify(failure)).not.toContain(TOKEN);
    expect(JSON.stringify(failure)).not.toContain('widget.js');
  });

  it.each([
    [
      'bad repository',
      () => createGithubPublicationAdapter({ repository: '../repo', token: TOKEN }),
    ],
    [
      'header-unsafe token',
      () =>
        createGithubPublicationAdapter({
          repository: 'owner/repo',
          token: 'token-with-newline\nvalue',
        }),
    ],
    ['bad tag', () => adapter(fetch).inspect('main')],
    ['bad release id', () => adapter(fetch).publishDraft({ releaseId: '../1' })],
    [
      'bad asset name',
      () =>
        adapter(fetch).uploadAsset({ releaseId: '1', name: '../secret', bytes: Buffer.from('x') }),
    ],
  ])('rejects %s', async (_name, operation) => {
    await expect(Promise.resolve().then(operation)).rejects.toBeInstanceOf(
      GithubPublicationAdapterError
    );
  });
});
