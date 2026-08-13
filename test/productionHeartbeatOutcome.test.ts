import { describe, expect, it, vi } from 'vitest';

import {
  classifyHeartbeatOutcome,
  outcome,
  sendHeartbeatOutcome,
} from '../scripts/production-heartbeat-outcome.mjs';

const observedAt = '2026-08-12T12:34:56.789Z';
const stages = Object.fromEntries(
  [
    'checkout',
    'node',
    'install',
    'config',
    'browser',
    'preflight',
    'identity',
    'venue',
    'canary',
    'cleanup',
    'sweep',
  ].map(stage => [stage, 'success'])
);

describe('production heartbeat classification', () => {
  it.each([
    ['verified', 'issue_verified'],
    ['delivery_failed', 'issue_absent'],
    ['delivery_failed', 'issue_duplicate'],
    ['delivery_failed', 'issue_contract_invalid'],
  ])('preserves authoritative %s evidence through ancillary failures', (name, reasonCode) => {
    const evidence = outcome(name, reasonCode, observedAt);
    expect(
      classifyHeartbeatOutcome({
        evidence,
        stages: { ...stages, cleanup: 'failure', sweep: 'failure' },
        artifactPrepare: 'failure',
        artifact: 'failure',
        incident: 'failure',
      })
    ).toEqual(evidence);
  });

  it.each([
    ['checkout', 'setup_failed'],
    ['browser', 'setup_failed'],
    ['identity', 'identity_failed'],
    ['venue', 'venue_failed'],
    ['canary', 'browser_inconclusive'],
    ['cleanup', 'cleanup_failed'],
    ['sweep', 'sweep_failed'],
  ])('maps a %s stage failure to %s', (stage, reasonCode) => {
    expect(
      classifyHeartbeatOutcome({
        stages: { ...stages, [stage]: 'failure' },
        artifactPrepare: 'success',
        artifact: 'success',
        incident: 'success',
      })
    ).toMatchObject({ outcome: 'inconclusive', reasonCode });
  });

  it('maps artifact and incident failures without inventing delivery failure', () => {
    expect(
      classifyHeartbeatOutcome({
        stages,
        artifactPrepare: 'failure',
        artifact: 'success',
        incident: 'success',
      })
    ).toMatchObject({ outcome: 'inconclusive', reasonCode: 'artifact_failed' });
    expect(
      classifyHeartbeatOutcome({
        stages,
        artifactPrepare: 'success',
        artifact: 'success',
        incident: 'failure',
      })
    ).toMatchObject({ outcome: 'inconclusive', reasonCode: 'incident_failed' });
  });

  it.each([
    'github_network',
    'github_5xx',
    'github_rate_limited',
    'github_auth_failed',
    'classification_failed',
  ])('preserves sanitized evidence reason %s', reasonCode => {
    const evidence = outcome('inconclusive', reasonCode, observedAt);
    expect(
      classifyHeartbeatOutcome({
        evidence,
        stages,
        artifactPrepare: 'success',
        artifact: 'success',
        incident: 'success',
      })
    ).toEqual(evidence);
  });

  it('fails malformed evidence closed as sanitized inconclusive classification', () => {
    expect(
      classifyHeartbeatOutcome({
        evidence: {
          schemaVersion: 1,
          outcome: 'delivery_failed',
          reasonCode: 'free form',
          observedAt: 'invalid',
        },
        stages,
        artifactPrepare: 'success',
        artifact: 'success',
        incident: 'success',
      })
    ).toMatchObject({ outcome: 'inconclusive', reasonCode: 'classification_failed' });
  });
});

describe('production heartbeat sender', () => {
  it('sends exact v1 JSON and accepts the strict receiver response', async () => {
    const report = outcome('verified', 'issue_verified', observedAt);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          schemaVersion: 1,
          accepted: true,
          duplicate: false,
          outcome: 'verified',
          effect: 'verified',
          observedAt,
        },
        { headers: { 'cache-control': 'no-store' } }
      )
    );
    await expect(
      sendHeartbeatOutcome({
        fetchImpl,
        endpoint: 'https://bugdrop.dev/api/monitor/heartbeat',
        secret: 'secret',
        heartbeatId: '123:1',
        report,
      })
    ).resolves.toMatchObject({ accepted: true });
    const request = fetchImpl.mock.calls[0];
    expect(request[1]?.headers).toMatchObject({
      Authorization: 'Bearer secret',
      'X-BugDrop-Heartbeat-Id': '123:1',
    });
    expect(JSON.parse(String(request[1]?.body))).toEqual(report);
  });

  it('accepts idempotent recorded_only responses but rejects a false inconclusive transition', async () => {
    const report = outcome('inconclusive', 'github_network', observedAt);
    await expect(
      sendHeartbeatOutcome({
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
          Response.json(
            {
              schemaVersion: 1,
              accepted: true,
              duplicate: true,
              outcome: 'inconclusive',
              effect: 'recorded_only',
              observedAt,
            },
            { headers: { 'cache-control': 'no-store' } }
          )
        ),
        endpoint: 'https://bugdrop.dev/api/monitor/heartbeat',
        secret: 'secret',
        heartbeatId: '123:1',
        report,
      })
    ).resolves.toMatchObject({ duplicate: true, effect: 'recorded_only' });
    await expect(
      sendHeartbeatOutcome({
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
          Response.json(
            {
              schemaVersion: 1,
              accepted: true,
              duplicate: false,
              outcome: 'inconclusive',
              effect: 'verified',
              observedAt,
            },
            { headers: { 'cache-control': 'no-store' } }
          )
        ),
        endpoint: 'https://bugdrop.dev/api/monitor/heartbeat',
        secret: 'secret',
        heartbeatId: '123:2',
        report,
      })
    ).rejects.toThrow('heartbeat_receiver_response_invalid');
  });

  it.each([
    [new Response(null, { status: 204 }), 'heartbeat_receiver_http_204'],
    [
      Response.json({ schemaVersion: 1 }, { headers: { 'cache-control': 'no-store' } }),
      'heartbeat_receiver_response_invalid',
    ],
    [
      Response.json(
        {
          schemaVersion: 1,
          accepted: true,
          duplicate: false,
          outcome: 'verified',
          effect: 'verified',
          observedAt,
        },
        { headers: { 'cache-control': 'max-age=60' } }
      ),
      'heartbeat_receiver_cache_invalid',
    ],
  ])('rejects an invalid receiver contract without including its body', async (response, error) => {
    await expect(
      sendHeartbeatOutcome({
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response),
        endpoint: 'https://bugdrop.dev/api/monitor/heartbeat',
        secret: 'secret',
        heartbeatId: '123:1',
        report: outcome('verified', 'issue_verified', observedAt),
      })
    ).rejects.toThrow(error);
  });

  it('rejects free-form reasons and noncanonical timestamps before network access', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      sendHeartbeatOutcome({
        fetchImpl,
        endpoint: 'https://bugdrop.dev/api/monitor/heartbeat',
        secret: 'secret',
        heartbeatId: '123:1',
        report: {
          schemaVersion: 1,
          outcome: 'delivery_failed',
          reasonCode: 'network broke',
          observedAt,
        },
      })
    ).rejects.toThrow('heartbeat_outcome_invalid');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
