import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/types';

const { mockGenerateGitHubAppJWT } = vi.hoisted(() => ({
  mockGenerateGitHubAppJWT: vi.fn(),
}));

vi.mock('../src/lib/jwt', () => ({ generateGitHubAppJWT: mockGenerateGitHubAppJWT }));

import {
  GitHubLabelError,
  createIssue,
  getInstallationToken,
  isRepoPublic,
  uploadAttachmentAsAsset,
  uploadScreenshotAsAsset,
} from '../src/lib/github';

const API_ROOT = 'https://api.github.com/repos/acme/widgets';
const TOKEN = 'installation-token';
const JWT = 'app-jwt';
const API_HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'BugDrop/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
};

interface ExpectedRequest {
  url: string | RegExp;
  method?: string;
  token?: string;
  body?: unknown;
  response: Response;
}

function expectRequests(requests: ExpectedRequest[]): ReturnType<typeof vi.fn<typeof fetch>> {
  let index = 0;
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const request = requests[index++];
    const url = typeof input === 'string' ? input : input.url;
    if (!request) throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);

    if (typeof request.url === 'string') expect(url).toBe(request.url);
    else expect(url).toMatch(request.url);
    expect(init?.method ?? 'GET').toBe(request.method ?? 'GET');
    expect(init?.headers).toEqual({
      ...API_HEADERS,
      Authorization: `Bearer ${request.token ?? TOKEN}`,
    });
    if ('body' in request) expect(JSON.parse(String(init?.body))).toEqual(request.body);
    else expect(init?.body).toBeUndefined();
    return request.response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function branchSetupRequests(createResponse = new Response(null, { status: 201 })) {
  return [
    {
      url: `${API_ROOT}/git/ref/heads/bugdrop-screenshots`,
      response: new Response(null, { status: 404 }),
    },
    { url: API_ROOT, response: Response.json({ default_branch: 'main' }) },
    {
      url: `${API_ROOT}/git/ref/heads/main`,
      response: Response.json({ object: { sha: 'base-sha' } }),
    },
    {
      url: `${API_ROOT}/git/refs`,
      method: 'POST',
      body: { ref: 'refs/heads/bugdrop-screenshots', sha: 'base-sha' },
      response: createResponse,
    },
  ];
}

describe('GitHub API boundary', () => {
  beforeEach(() => {
    mockGenerateGitHubAppJWT.mockReset().mockResolvedValue(JWT);
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async input => {
        const url = typeof input === 'string' ? input : input.url;
        throw new Error(`Unexpected request: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gets the installation and token with exact requests and fails each stage closed', async () => {
    const env = { GITHUB_APP_ID: '42', GITHUB_PRIVATE_KEY: 'private-key' } as Env;
    let fetchMock = expectRequests([
      {
        url: `${API_ROOT}/installation`,
        token: JWT,
        response: Response.json({ id: 123 }),
      },
      {
        url: 'https://api.github.com/app/installations/123/access_tokens',
        method: 'POST',
        token: JWT,
        response: Response.json({ token: TOKEN }),
      },
    ]);
    await expect(getInstallationToken(env, 'acme', 'widgets')).resolves.toBe(TOKEN);
    expect(mockGenerateGitHubAppJWT).toHaveBeenNthCalledWith(1, '42', 'private-key');
    expect(mockGenerateGitHubAppJWT).toHaveBeenNthCalledWith(2, '42', 'private-key');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock = expectRequests([
      {
        url: `${API_ROOT}/installation`,
        token: JWT,
        response: new Response('missing', { status: 404 }),
      },
    ]);
    await expect(getInstallationToken(env, 'acme', 'widgets')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();

    expectRequests([
      { url: `${API_ROOT}/installation`, token: JWT, response: Response.json({ id: 123 }) },
      {
        url: 'https://api.github.com/app/installations/123/access_tokens',
        method: 'POST',
        token: JWT,
        response: new Response('denied', { status: 403 }),
      },
    ]);
    await expect(getInstallationToken(env, 'acme', 'widgets')).resolves.toBeNull();
    await expect(getInstallationToken({} as Env, 'acme', 'widgets')).resolves.toBeNull();
  });

  it('creates issues and classifies only structured label validation failures', async () => {
    const issue = { number: 7, html_url: 'https://github.com/acme/widgets/issues/7' };
    let fetchMock = expectRequests([
      {
        url: `${API_ROOT}/issues`,
        method: 'POST',
        body: { title: 'Title', body: 'Body', labels: ['feedback', 'urgent'] },
        response: Response.json(issue),
      },
    ]);
    await expect(
      createIssue(TOKEN, 'acme', 'widgets', 'Title', 'Body', ['feedback', 'urgent'])
    ).resolves.toEqual(issue);
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock = expectRequests([
      {
        url: `${API_ROOT}/issues`,
        method: 'POST',
        body: { title: 'Title', body: 'Body', labels: ['bad'] },
        response: Response.json({ errors: [{ field: 'labels' }] }, { status: 422 }),
      },
    ]);
    const labelError = await createIssue(TOKEN, 'acme', 'widgets', 'Title', 'Body', ['bad']).catch(
      (error: unknown) => error
    );
    expect(labelError).toBeInstanceOf(GitHubLabelError);
    expect(labelError).toMatchObject({ status: 422 });

    for (const body of ['{"errors":[{"field":"title"}]}', 'labels are invalid']) {
      expectRequests([
        {
          url: `${API_ROOT}/issues`,
          method: 'POST',
          body: { title: 'Title', body: 'Body', labels: ['bad'] },
          response: new Response(body, { status: 422 }),
        },
      ]);
      await expect(createIssue(TOKEN, 'acme', 'widgets', 'Title', 'Body', ['bad'])).rejects.toThrow(
        `Failed to create issue: 422 - ${body}`
      );
    }
  });

  it('reports repository visibility and fails closed on HTTP or transport errors', async () => {
    let fetchMock = expectRequests([
      { url: API_ROOT, response: Response.json({ private: false }) },
    ]);
    await expect(isRepoPublic(TOKEN, 'acme', 'widgets')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock = expectRequests([{ url: API_ROOT, response: Response.json({ private: true }) }]);
    await expect(isRepoPublic(TOKEN, 'acme', 'widgets')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();

    expectRequests([{ url: API_ROOT, response: new Response('denied', { status: 403 }) }]);
    await expect(isRepoPublic(TOKEN, 'acme', 'widgets')).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')));
    await expect(isRepoPublic(TOKEN, 'acme', 'widgets')).resolves.toBe(false);
  });

  it('fails closed when the observed URL, method, authorization header, API version, or body is mutated', async () => {
    const fetchMock = expectRequests([
      {
        url: `${API_ROOT}/issues`,
        method: 'POST',
        body: { title: 'Exact title', body: 'Exact body', labels: ['feedback'] },
        response: Response.json({ number: 9, html_url: 'https://github.com/issue/9' }),
      },
    ]);
    await createIssue(TOKEN, 'acme', 'widgets', 'Exact title', 'Exact body');
    expect(fetchMock).toHaveBeenCalledWith(`${API_ROOT}/issues`, {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ title: 'Exact title', body: 'Exact body', labels: ['feedback'] }),
    });
  });
});

describe('GitHub asset persistence', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async input => {
        const url = typeof input === 'string' ? input : input.url;
        throw new Error(`Unexpected request: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recovers only from the exact already-existing-ref race after confirming the branch', async () => {
    let branchChecks = 0;
    let branchCreates = 0;
    const uploadedUrls: string[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      expect(init?.headers).toEqual(API_HEADERS);
      if (url === `${API_ROOT}/git/ref/heads/bugdrop-screenshots`) {
        expect(init?.method).toBeUndefined();
        branchChecks += 1;
        return branchChecks <= 2
          ? new Response(null, { status: 404 })
          : Response.json({ ref: 'refs/heads/bugdrop-screenshots' });
      }
      if (url === API_ROOT) {
        expect(init?.method).toBeUndefined();
        return Response.json({ default_branch: 'main' });
      }
      if (url === `${API_ROOT}/git/ref/heads/main`) {
        expect(init?.method).toBeUndefined();
        return Response.json({ object: { sha: 'base-sha' } });
      }
      if (url === `${API_ROOT}/git/refs`) {
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({
          ref: 'refs/heads/bugdrop-screenshots',
          sha: 'base-sha',
        });
        branchCreates += 1;
        return branchCreates === 1
          ? new Response(null, { status: 201 })
          : Response.json({ message: 'Reference already exists' }, { status: 422 });
      }
      if (url.startsWith(`${API_ROOT}/contents/.bugdrop/screenshots/`)) {
        expect(init?.method).toBe('PUT');
        uploadedUrls.push(url);
        return Response.json({
          content: { html_url: `https://github.com/blob/${uploadedUrls.length}` },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      uploadScreenshotAsAsset(TOKEN, 'acme', 'widgets', 'data:image/png;base64,AAA='),
      uploadScreenshotAsAsset(TOKEN, 'acme', 'widgets', 'data:image/png;base64,BBB='),
    ]);

    expect(results).toEqual([
      'https://github.com/blob/1?raw=true',
      'https://github.com/blob/2?raw=true',
    ]);
    expect(branchChecks).toBe(3);
    expect(branchCreates).toBe(2);
    expect(new Set(uploadedUrls).size).toBe(2);
  });

  it('rejects unrelated or malformed 422 responses and failed branch rechecks', async () => {
    const cases = [
      { body: '{"message":"Validation Failed"}', recheck: false },
      { body: '{"message":"Reference already exists today"}', recheck: false },
      { body: 'not-json', recheck: false },
      { body: '{"message":"Reference already exists"}', recheck: true },
    ];

    for (const testCase of cases) {
      const requests: ExpectedRequest[] = branchSetupRequests(
        new Response(testCase.body, { status: 422 })
      );
      if (testCase.recheck) {
        requests.push({
          url: `${API_ROOT}/git/ref/heads/bugdrop-screenshots`,
          response: new Response('still missing', { status: 404 }),
        });
      }
      expectRequests(requests);
      await expect(
        uploadScreenshotAsAsset(TOKEN, 'acme', 'widgets', 'data:image/png;base64,AAA=')
      ).rejects.toThrow(`Failed to create screenshot branch: 422 - ${testCase.body}`);
    }
  });

  it('fails closed when the initial screenshot branch lookup is not 404', async () => {
    const fetchMock = expectRequests([
      {
        url: `${API_ROOT}/git/ref/heads/bugdrop-screenshots`,
        response: new Response('forbidden', { status: 403 }),
      },
    ]);
    await expect(
      uploadScreenshotAsAsset(TOKEN, 'acme', 'widgets', 'data:image/png;base64,AAA=')
    ).rejects.toThrow('Failed to check screenshot branch: 403');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('uses distinct screenshot and attachment paths in the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_725_000_000_000);
    const uploadedUrls: string[] = [];
    const uploadedBodies: Array<{ message: string; content: string; branch: string }> = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      expect(init?.headers).toEqual(API_HEADERS);
      if (url === `${API_ROOT}/git/ref/heads/bugdrop-screenshots`) {
        expect(init?.method).toBeUndefined();
        return Response.json({ ref: 'refs/heads/bugdrop-screenshots' });
      }
      if (url.startsWith(`${API_ROOT}/contents/`)) {
        expect(init?.method).toBe('PUT');
        uploadedUrls.push(url);
        uploadedBodies.push(JSON.parse(String(init?.body)) as (typeof uploadedBodies)[number]);
        return Response.json({
          content: { html_url: `https://github.com/blob/${uploadedUrls.length}` },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      uploadScreenshotAsAsset(TOKEN, 'acme', 'widgets', 'data:image/png;base64,AAA='),
      uploadScreenshotAsAsset(TOKEN, 'acme', 'widgets', 'data:image/png;base64,BBB='),
      uploadAttachmentAsAsset(TOKEN, 'acme', 'widgets', {
        name: ' ../../bad name?.txt ',
        type: 'text/plain',
        size: 3,
        dataUrl: 'data:text/plain;base64,Q0ND',
      }),
      uploadAttachmentAsAsset(TOKEN, 'acme', 'widgets', {
        name: '///',
        type: 'text/plain',
        size: 3,
        dataUrl: 'data:text/plain;base64,RERE',
      }),
    ]);

    expect(results).toEqual([
      'https://github.com/blob/1?raw=true',
      'https://github.com/blob/2?raw=true',
      'https://github.com/blob/3?raw=true',
      'https://github.com/blob/4?raw=true',
    ]);
    expect(new Set(uploadedUrls).size).toBe(4);
    expect(uploadedUrls[0]).toMatch(/\/screenshots\/1725000000000-[0-9a-f-]{36}\.png$/);
    expect(uploadedUrls[1]).toMatch(/\/screenshots\/1725000000000-[0-9a-f-]{36}\.png$/);
    expect(uploadedUrls[2]).toMatch(
      /\/uploads\/1725000000000-[0-9a-f-]{36}-\.\.-\.\.-bad-name-\.txt$/
    );
    expect(uploadedUrls[3]).toMatch(/\/uploads\/1725000000000-[0-9a-f-]{36}-upload$/);
    expect(uploadedBodies.map(body => body.content)).toEqual(['AAA=', 'BBB=', 'Q0ND', 'RERE']);
    expect(uploadedBodies.every(body => body.branch === 'bugdrop-screenshots')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('reports exact setup and upload failures', async () => {
    for (const { requests, message } of [
      {
        requests: [
          branchSetupRequests()[0],
          { url: API_ROOT, response: new Response('denied', { status: 403 }) },
        ],
        message: 'Failed to get repo info: 403',
      },
      {
        requests: [
          ...branchSetupRequests().slice(0, 2),
          {
            url: `${API_ROOT}/git/ref/heads/main`,
            response: new Response('missing', { status: 404 }),
          },
        ],
        message: 'Failed to get default branch ref: 404',
      },
      {
        requests: [
          {
            url: `${API_ROOT}/git/ref/heads/bugdrop-screenshots`,
            response: Response.json({ ref: 'existing' }),
          },
          {
            url: /^https:\/\/api\.github\.com\/repos\/acme\/widgets\/contents\//,
            method: 'PUT',
            body: {
              message: expect.stringMatching(/^Add BugDrop screenshot \d+$/),
              content: 'AAA=',
              branch: 'bugdrop-screenshots',
            },
            response: new Response('conflict', { status: 409 }),
          },
        ],
        message: 'Failed to upload screenshot: 409 - conflict',
      },
    ] as Array<{ requests: ExpectedRequest[]; message: string }>) {
      expectRequests(requests);
      await expect(
        uploadScreenshotAsAsset(TOKEN, 'acme', 'widgets', 'data:image/png;base64,AAA=')
      ).rejects.toThrow(message);
    }
  });
});
