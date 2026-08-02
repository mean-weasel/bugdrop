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
const RENDERED_SUBMISSION_ID = 'submission-95a970ec-e4fa-41da-9a29-f4b62fb941ca';
const noWait = vi.fn(async () => {});

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
      '## Canary marker',
      '',
      MARKER,
      '',
      '<details>',
      '<summary>System Info</summary>',
      '</details>',
      '',
      `<!-- bugdrop-submission: ci:${MARKER} -->`,
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
    kind: 'structured',
    submissionId: `ci:${MARKER}`,
    issueNumber: 42,
    issueUrl: `https://github.com/${REPO}/issues/42`,
    workerSha: SHA,
    ...overrides,
  };
}

function renderedResult(overrides: Record<string, unknown> = {}) {
  return result({
    presentation: 'modal',
    submissionId: RENDERED_SUBMISSION_ID,
    ...overrides,
  });
}

function issueFetch(
  matches: Issue[],
  direct: Issue = matches[0]
): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async input =>
    String(input).includes('/issues?') ? jsonResponse(matches) : jsonResponse(direct)
  );
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
    const fetchImpl = issueFetch([issue()]);

    const verified = await verifyCanaryIssue({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      expectedSha: SHA,
      result: result(),
      sleepImpl: noWait,
    });

    expect(verified.number).toBe(42);
    expect(verified.html_url).toBe(`https://github.com/${REPO}/issues/42`);
  });

  it('verifies a rendered modal result with its runtime submission identity', async () => {
    const renderedIssue = issue({
      body: issue().body.replace(`ci:${MARKER}`, RENDERED_SUBMISSION_ID),
    });
    const fetchImpl = issueFetch([renderedIssue]);

    const verified = await verifyCanaryIssue({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      expectedSha: SHA,
      result: renderedResult(),
      sleepImpl: noWait,
    });

    expect(verified.number).toBe(42);
  });

  it.each([
    ['missing rendered identity', renderedResult({ submissionId: undefined })],
    ['non-rendered identity', renderedResult({ submissionId: `ci:${MARKER}` })],
    ['malformed rendered identity', renderedResult({ submissionId: 'submission-not-random' })],
  ])('rejects a rendered modal result with %s', async (_name, browserResult) => {
    const renderedIssue = issue({
      body: issue().body.replace(`ci:${MARKER}`, RENDERED_SUBMISSION_ID),
    });
    const fetchImpl = issueFetch([renderedIssue]);

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: browserResult,
        sleepImpl: noWait,
      })
    ).rejects.toThrow('rendered submission identity');
  });

  it.each([
    ['wrong title', issue({ title: `${CANARY_TITLE_PREFIX} wrong` })],
    ['missing body marker', issue({ body: '## Description\nmissing marker' })],
    [
      'legacy body shape',
      issue({ body: issue().body.replace('## Canary marker', '## Description') }),
    ],
    [
      'wrong structured submission marker',
      issue({
        body: issue().body.replace(`<!-- bugdrop-submission: ci:${MARKER} -->`, '<!-- wrong -->'),
      }),
    ],
    [
      'wrong structured section value with marker retained in submission comment',
      issue({
        body: issue().body.replace(`## Canary marker\n\n${MARKER}`, '## Canary marker\n\nwrong'),
      }),
    ],
    ['unexpected labels', issue({ labels: [{ name: 'bug' }] })],
    ['wrong author', issue({ user: { login: 'someone-else' } })],
    ['closed before verification', issue({ state: 'closed' })],
    ['screenshot section', issue({ body: `${issue().body}\n## Screenshot` })],
  ])('rejects %s', async (_name, candidate) => {
    const fetchImpl = issueFetch([candidate], candidate);

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: result(),
        sleepImpl: noWait,
      })
    ).rejects.toThrow();
  });

  it('rejects duplicate marker matches while preserving their numbers for cleanup diagnostics', async () => {
    const candidates = [issue(), issue({ number: 43 })];
    const fetchImpl = issueFetch(candidates);

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: result(),
        sleepImpl: noWait,
      })
    ).rejects.toThrow('exactly one');
  });

  it.each([
    ['missing result', undefined],
    ['wrong marker', result({ marker: 'wrong-marker' })],
    ['wrong kind', result({ kind: 'legacy' })],
    ['wrong submission ID', result({ submissionId: 'wrong' })],
    ['wrong number', result({ issueNumber: 99 })],
    ['wrong URL', result({ issueUrl: `https://github.com/${REPO}/issues/99` })],
    ['wrong Worker SHA', result({ workerSha: 'b'.repeat(40) })],
  ])('rejects a %s independently of cleanup discovery', async (_name, browserResult) => {
    const fetchImpl = issueFetch([issue()]);

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: browserResult,
        sleepImpl: noWait,
      })
    ).rejects.toThrow();
  });

  it('uses exact browser Issue readback while bounded list discovery stabilizes', async () => {
    const candidate = issue();
    const listResponses = [[], [candidate], [candidate]];
    const sleepImpl = vi.fn(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      if (!String(input).includes('/issues?')) return jsonResponse(candidate);
      return jsonResponse(listResponses.shift() ?? [candidate]);
    });

    const verified = await verifyCanaryIssue({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      expectedSha: SHA,
      result: result(),
      consistencyAttempts: 4,
      sleepImpl,
    });

    expect(verified.number).toBe(42);
    expect(sleepImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toMatch(/\/issues\/42$/);
  });

  it('fails immediately when a duplicate appears during singleton stabilization', async () => {
    const candidate = issue();
    const duplicate = issue({ number: 43 });
    const listResponses = [[candidate], [candidate, duplicate]];
    const fetchImpl = vi.fn<typeof fetch>(async input => {
      if (!String(input).includes('/issues?')) return jsonResponse(candidate);
      return jsonResponse(listResponses.shift() ?? [candidate, duplicate]);
    });

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: result(),
        consistencyAttempts: 4,
        sleepImpl: noWait,
      })
    ).rejects.toThrow('found 2');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects a stable marker singleton that differs from the browser-reported Issue', async () => {
    const browserIssue = issue();
    const otherMatch = issue({ number: 43 });
    const fetchImpl = issueFetch([otherMatch], browserIssue);

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: result(),
        sleepImpl: noWait,
      })
    ).rejects.toThrow('not browser Issue #42');
  });

  it('rejects an unbounded consistency configuration before making a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      verifyCanaryIssue({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        expectedSha: SHA,
        result: result(),
        consistencyAttempts: Number.POSITIVE_INFINITY,
      })
    ).rejects.toThrow('consistencyAttempts');
    expect(fetchImpl).not.toHaveBeenCalled();
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
      sleepImpl: noWait,
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
      closeMatchingIssues({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        consistencyAttempts: 2,
        sleepImpl: noWait,
      })
    ).rejects.toThrow('42');
    expect(issues[1].state).toBe('closed');
  });

  it('waits for a newly-created marker Issue to appear before cleanup', async () => {
    const candidate = issue();
    const listResponses = [[], [], [candidate], [candidate]];
    const sleepImpl = vi.fn(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('/issues?')) {
        return jsonResponse(listResponses.shift() ?? [candidate]);
      }
      if (init?.method === 'PATCH') candidate.state = 'closed';
      return jsonResponse(candidate);
    });

    const cleanup = await closeMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      consistencyAttempts: 4,
      sleepImpl,
    });

    expect(cleanup.closedNumbers).toEqual([42]);
    expect(cleanup.openNumbers).toEqual([]);
    expect(sleepImpl).toHaveBeenCalledTimes(3);
  });

  it('fails closed when marker cleanup never observes the newly-created Issue', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([]));

    await expect(
      closeMatchingIssues({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        consistencyAttempts: 3,
        sleepImpl: noWait,
      })
    ).rejects.toThrow('appeared within the retry bound');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('requires stable zero-open evidence after cleanup', async () => {
    const candidate = issue();
    const listResponses = [[candidate], [], []];
    const sleepImpl = vi.fn(async () => {});
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('/issues?')) {
        return jsonResponse(listResponses.shift() ?? []);
      }
      if (init?.method === 'PATCH') candidate.state = 'closed';
      return jsonResponse(candidate);
    });

    const cleanup = await closeMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      consistencyAttempts: 3,
      sleepImpl,
    });

    expect(cleanup.openNumbers).toEqual([]);
    expect(listResponses).toEqual([]);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects a late open match after a transient empty final list', async () => {
    const candidate = issue();
    const lateDuplicate = issue({ number: 43 });
    const listResponses = [[candidate], [], [lateDuplicate], [lateDuplicate]];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).includes('/issues?')) {
        return jsonResponse(listResponses.shift() ?? [lateDuplicate]);
      }
      if (init?.method === 'PATCH') candidate.state = 'closed';
      return jsonResponse(candidate);
    });

    await expect(
      closeMatchingIssues({
        fetchImpl,
        repo: REPO,
        token: TOKEN,
        marker: MARKER,
        consistencyAttempts: 3,
        sleepImpl: noWait,
      })
    ).rejects.toThrow('still open after cleanup: #43');
    expect(listResponses).toEqual([]);
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
      sleepImpl: noWait,
    });

    expect(cleanup.closedNumbers).toEqual([42]);
    expect(listCount).toBe(3);
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

    await closeMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      sleepImpl: noWait,
    });

    expect(patchCount).toBe(2);
    expect(candidate.state).toBe('closed');
  });

  it('waits for stale exact and paginated close readbacks without another PATCH', async () => {
    const openCandidate = issue();
    const closedCandidate = issue({ state: 'closed' });
    const exactStates = [openCandidate, openCandidate, closedCandidate];
    const listStates = [[openCandidate], [openCandidate], [openCandidate], [closedCandidate]];
    const sleepImpl = vi.fn(async () => {});
    let patchCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (init?.method === 'PATCH') {
        patchCount += 1;
        return jsonResponse(closedCandidate);
      }
      if (String(input).includes('/issues?')) {
        return jsonResponse(listStates.shift() ?? [closedCandidate]);
      }
      return jsonResponse(exactStates.shift() ?? closedCandidate);
    });

    const cleanup = await closeMatchingIssues({
      fetchImpl,
      repo: REPO,
      token: TOKEN,
      marker: MARKER,
      consistencyAttempts: 4,
      sleepImpl,
    });

    expect(cleanup.openNumbers).toEqual([]);
    expect(patchCount).toBe(1);
    expect(sleepImpl).toHaveBeenCalledTimes(5);
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
      sleepImpl: noWait,
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
    const fetchImpl = issueFetch([issue()]);
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
        sleepImpl: noWait,
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
