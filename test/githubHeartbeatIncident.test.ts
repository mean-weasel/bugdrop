import { describe, expect, it, vi } from 'vitest';

import {
  INCIDENT_TITLE,
  listIncidents,
  transitionHeartbeatIncident,
} from '../scripts/github-heartbeat-incident.mjs';

const TOKEN = 'incident-token-redaction-sentinel';
const RUN_URL = 'https://github.com/mean-weasel/bugdrop/actions/runs/123';

function response(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });
}

function incident(state: 'open' | 'closed' = 'open', number = 7) {
  return { number, title: INCIDENT_TITLE, state };
}

function transition(fetchImpl: typeof fetch, outcome: 'failure' | 'recovery') {
  return transitionHeartbeatIncident({
    fetchImpl,
    token: TOKEN,
    outcome,
    runUrl: RUN_URL,
    details: 'synthetic stage result',
  });
}

describe('heartbeat incident discovery', () => {
  it('paginates, filters pull requests, and rejects duplicate incidents before mutation', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([{ ...incident(), pull_request: {} }], {
          headers: {
            Link: '<https://api.github.com/repos/mean-weasel/bugdrop/issues?state=all&page=2>; rel="next"',
          },
        })
      )
      .mockResolvedValueOnce(response([incident('open', 7), incident('closed', 8)]));
    await expect(transition(fetchImpl, 'failure')).rejects.toThrow('found 2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.every(call => call[1]?.method !== 'POST')).toBe(true);
  });

  it('returns only the stable exact incident title', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([incident(), { ...incident('open', 8), title: `${INCIDENT_TITLE} extra` }])
      );
    await expect(listIncidents({ fetchImpl, token: TOKEN })).resolves.toHaveLength(1);
  });

  it('scopes incident discovery to the configured private operational repository', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    await listIncidents({ fetchImpl, token: TOKEN, repo: 'acme/private-bugdrop' });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/repos/acme/private-bugdrop/issues');
  });
});

describe('heartbeat incident lifecycle', () => {
  it('creates on first failure and comments on recurrence', async () => {
    const created = incident();
    const createFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response(created));
    await expect(transition(createFetch, 'failure')).resolves.toMatchObject({ action: 'created' });
    expect(JSON.parse(String(createFetch.mock.calls[1][1]?.body))).toMatchObject({
      title: INCIDENT_TITLE,
    });

    const updateFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([created]))
      .mockResolvedValueOnce(response({ id: 99 }));
    await expect(transition(updateFetch, 'failure')).resolves.toMatchObject({ action: 'updated' });
    expect(String(updateFetch.mock.calls[1][0])).toContain('/issues/7/comments');
  });

  it('reopens a closed incident on recurrence, then comments', async () => {
    const closed = incident('closed');
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([closed]))
      .mockResolvedValueOnce(response(incident('open')))
      .mockResolvedValueOnce(response({ id: 99 }));
    await expect(transition(fetchImpl, 'failure')).resolves.toMatchObject({ action: 'reopened' });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({ state: 'open' });
  });

  it('comments and closes one open incident on recovery', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([incident()]))
      .mockResolvedValueOnce(response({ id: 99 }))
      .mockResolvedValueOnce(response(incident('closed')));
    await expect(transition(fetchImpl, 'recovery')).resolves.toMatchObject({ action: 'closed' });
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toEqual({
      state: 'closed',
      state_reason: 'completed',
    });
  });

  it('does nothing when recovery has no incident', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    await expect(transition(fetchImpl, 'recovery')).resolves.toEqual({
      action: 'none',
      state: 'absent',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reconciles an ambiguous create by rediscovery', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([]))
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce(response([incident()]));
    await expect(transition(fetchImpl, 'failure')).resolves.toMatchObject({ action: 'created' });
  });

  it('redacts the token on a failed mutation and failed reconciliation', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([]))
      .mockRejectedValueOnce(new Error(`lost ${TOKEN}`))
      .mockRejectedValueOnce(new Error(`also ${TOKEN}`));
    let message = '';
    try {
      await transition(fetchImpl, 'failure');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('[REDACTED]');
    expect(message).not.toContain(TOKEN);
  });
});
