import { describe, expect, it, vi } from 'vitest';
import {
  CANARY_TITLE_PREFIX,
  canaryTitle,
  closeMatchingIssues,
  listMatchingIssues,
  runCli,
  verifyCanaryIssue,
} from '../scripts/github-issue-canary.mjs';

const REPO = 'mean-weasel/bugdrop-widget-test';
const MARKER = `bugdrop-ci-canary:123:1:${'a'.repeat(40)}`;
const SHA = 'a'.repeat(40);
const TOKEN = 'synthetic-redaction-sentinel-not-a-credential';

type Issue = {
  number: number;
  html_url: string;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  user: { login: string };
  pull_request?: { url: string };
};

function issue(overrides: Partial<Issue> = {}): Issue {
  const number = overrides.number ?? 42;
  return {
    number,
    html_url: `https://github.com/${REPO}/issues/${number}`,
    title: canaryTitle(MARKER),
    body: [
      '## Description',
      MARKER,
      '',
      '<details>',
      '<summary>System Info</summary>',
      '</details>',
      '',
      '---',
      '*Submitted via [BugDrop](https://github.com/mean-weasel/bugdrop)*',
    ].join('\n'),
    state: 'open',
    labels: [{ name: 'bug' }, { name: 'bugdrop' }],
    user: { login: 'neonwatty-bugdrop[bot]' },
    ...overrides,
  };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    marker: MARKER,
    issueNumber: 42,
    issueUrl: `https://github.com/${REPO}/issues/42`,
    workerSha: SHA,
    ...overrides,
  };
}

describe('GitHub Issue canary discovery and verification', () => {
  it('paginates state=all, filters PRs, and discovers a body-only marker', async () => {
    const matching = issue({ number: 42, title: 'unexpected title' });
    const pullRequest = issue({
      number: 43,
      pull_request: { url: 'https://api.github.com/repos/example/pulls/43' },
    });
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse([pullRequest], {
          headers: {
            Link: `<https://api.github.com/repos/mean-weasel/bugdrop-widget-test/issues?state=all&per_page=100&page=2>; rel="next"`,
          },
        })
      )
      .mockResolvedValueOnce(jsonResponse([matching]));

    const matches = await listMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
    });

    expect(matches.map(candidate => candidate.number)).toEqual([42]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('state=all');
    expect(String(fetchImpl.mock.calls[0][0])).toContain('per_page=100');
  });

  it('verifies the complete Issue and browser response contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([issue()]));

    const verified = await verifyCanaryIssue({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      expectedSha: SHA,
      result: result(),
    });

    expect(verified.number).toBe(42);
    expect(verified.html_url).toBe(`https://github.com/${REPO}/issues/42`);
  });

  it.each([
    ['wrong title', issue({ title: `${CANARY_TITLE_PREFIX} wrong` })],
    ['missing body marker', issue({ body: '## Description\nmissing marker' })],
    ['unexpected labels', issue({ labels: [{ name: 'bug' }] })],
    ['wrong author', issue({ user: { login: 'someone-else' } })],
    ['closed before verification', issue({ state: 'closed' })],
    ['screenshot section', issue({ body: `${issue().body}\n## Screenshot` })],
  ])('rejects %s', async (_name, candidate) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([candidate]));

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: result(),
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate marker matches while preserving their numbers for cleanup diagnostics', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([issue(), issue({ number: 43 })]));

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: result(),
      })
    ).rejects.toThrow('exactly one');
  });

  it.each([
    ['missing result', undefined],
    ['wrong marker', result({ marker: 'wrong-marker' })],
    ['wrong number', result({ issueNumber: 99 })],
    ['wrong URL', result({ issueUrl: `https://github.com/${REPO}/issues/99` })],
    ['wrong Worker SHA', result({ workerSha: 'b'.repeat(40) })],
  ])('rejects a %s independently of cleanup discovery', async (_name, browserResult) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([issue()]));

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: browserResult,
      })
    ).rejects.toThrow();
  });
});

describe('GitHub Issue canary cleanup', () => {
  it('closes every duplicate marker match and proves none remain open', async () => {
    const issues = [issue(), issue({ number: 43 })];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/issues?')) return jsonResponse(issues);
      const number = Number(url.split('/').pop());
      const candidate = issues.find(item => item.number === number)!;
      if (init?.method === 'PATCH') {
        candidate.state = 'closed';
        return jsonResponse(candidate);
      }
      return jsonResponse(candidate);
    });

    const cleanup = await closeMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
    });

    expect(cleanup.matchedNumbers).toEqual([42, 43]);
    expect(cleanup.closedNumbers).toEqual([42, 43]);
    expect(issues.every(candidate => candidate.state === 'closed')).toBe(true);
  });

  it('continues closing later matches after one close fails, then reports the remaining leak', async () => {
    const issues = [issue(), issue({ number: 43 })];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/issues?')) return jsonResponse(issues);
      const number = Number(url.split('/').pop());
      const candidate = issues.find(item => item.number === number)!;
      if (init?.method === 'PATCH' && number === 42) {
        return new Response('close failed', { status: 500 });
      }
      if (init?.method === 'PATCH') candidate.state = 'closed';
      return jsonResponse(candidate);
    });

    await expect(
      closeMatchingIssues({ fetchImpl, repo: REPO, token: TOKEN, marker: MARKER })
    ).rejects.toThrow('42');
    expect(issues[1].state).toBe('closed');
  });

  it('treats an ambiguous close as success when exact readback is closed', async () => {
    const candidate = issue();
    let listCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/issues?')) {
        listCount += 1;
        return jsonResponse([candidate]);
      }
      if (init?.method === 'PATCH') {
        candidate.state = 'closed';
        return new Response('gateway lost the response', { status: 502 });
      }
      return jsonResponse(candidate);
    });

    const cleanup = await closeMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
    });

    expect(cleanup.closedNumbers).toEqual([42]);
    expect(listCount).toBe(2);
  });

  it('retries an ambiguous close once only after readback proves the Issue is still open', async () => {
    const candidate = issue();
    let patchCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/issues?')) return jsonResponse([candidate]);
      if (init?.method === 'PATCH') {
        patchCount += 1;
        if (patchCount === 1) return new Response('timeout', { status: 504 });
        candidate.state = 'closed';
      }
      return jsonResponse(candidate);
    });

    await closeMatchingIssues({ fetchImpl, repo: REPO, token: TOKEN, marker: MARKER });

    expect(patchCount).toBe(2);
    expect(candidate.state).toBe('closed');
  });

  it('sweeps only open non-PR Issues with the reserved title prefix', async () => {
    const stale = issue({ title: `${CANARY_TITLE_PREFIX} stale-run`, body: 'stale' });
    const human = issue({ number: 43, title: 'Human issue', body: CANARY_TITLE_PREFIX });
    const pullRequest = issue({
      number: 44,
      title: `${CANARY_TITLE_PREFIX} pull-request`,
      pull_request: { url: 'https://api.github.com/pulls/44' },
    });
    const issues = [stale, human, pullRequest];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/issues?')) return jsonResponse(issues);
      stale.state = init?.method === 'PATCH' ? 'closed' : stale.state;
      return jsonResponse(stale);
    });

    const cleanup = await closeMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      prefix: CANARY_TITLE_PREFIX,
    });

    expect(cleanup.matchedNumbers).toEqual([42]);
    expect(human.state).toBe('open');
    expect(pullRequest.state).toBe('open');
  });

  it('redacts the token from API errors and never calls the Issues create endpoint', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(`failure echoed ${TOKEN}`, {
        status: 401,
        headers: { 'Content-Type': 'text/plain' },
      })
    );

    let message = '';
    try {
      await listMatchingIssues({ fetchImpl, repo: REPO, token: TOKEN, marker: MARKER });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(TOKEN);
    expect(message).toContain('[REDACTED]');
    expect(fetchImpl.mock.calls.every(call => initMethod(call[1]) !== 'POST')).toBe(true);
  });
});

describe('GitHub Issue canary CLI', () => {
  it('verifies through the CLI without exposing its token', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([issue()]));
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runCli(
      [
        'verify',
        '--repo',
        REPO,
        '--marker',
        MARKER,
        '--expected-sha',
        SHA,
        '--result-file',
        'result.json',
      ],
      {
        fetchImpl,
        env: { BUGDROP_CANARY_GITHUB_TOKEN: TOKEN },
        readFileImpl: vi.fn().mockResolvedValue(JSON.stringify(result())),
        stdout: value => output.push(value),
        stderr: value => errors.push(value),
      }
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(output[0])).toEqual({
      verified: true,
      issueNumber: 42,
      issueUrl: `https://github.com/${REPO}/issues/42`,
    });
    expect(errors).toEqual([]);
    expect(output.join('\n')).not.toContain(TOKEN);
  });

  it('fails closed before an API request when the token is missing', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const errors: string[] = [];

    const exitCode = await runCli(['sweep', '--repo', REPO, '--prefix', CANARY_TITLE_PREFIX], {
      fetchImpl,
      env: {},
      stdout: vi.fn(),
      stderr: value => errors.push(value),
    });

    expect(exitCode).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errors.join('\n')).toContain('BUGDROP_CANARY_GITHUB_TOKEN is required');
  });

  it('reports malformed arguments without an uncaught exception', async () => {
    const errors: string[] = [];

    const exitCode = await runCli(['cleanup', '--marker'], {
      fetchImpl: vi.fn<typeof fetch>(),
      env: { BUGDROP_CANARY_GITHUB_TOKEN: TOKEN },
      stdout: vi.fn(),
      stderr: value => errors.push(value),
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual(['[bugdrop-canary] --marker requires a value']);
  });
});

function initMethod(init: RequestInit | undefined): string {
  return init?.method ?? 'GET';
}
