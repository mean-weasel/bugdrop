import { describe, expect, it, vi } from 'vitest';

import {
  DiscordReleaseError,
  buildDiscordPayload,
  executeDiscordNotification,
  normalizeNotificationRequest,
  resolveNotificationAttempt,
  sendDiscordNotification,
} from '../../scripts/discord-release.mjs';

const PLAN_ID = `sha256:${'a'.repeat(64)}`;

function release() {
  return {
    tag_name: 'v1.56.0',
    name: 'BugDrop 1.56.0',
    body: 'Release notes',
    html_url: 'https://github.com/mean-weasel/bugdrop/releases/tag/v1.56.0',
    published_at: '2026-08-03T00:00:00Z',
    author: { login: 'release-bot' },
  };
}

function automatic(overrides: Record<string, unknown> = {}) {
  return normalizeNotificationRequest({
    repository: 'mean-weasel/bugdrop',
    tag: 'v1.56.0',
    releasePlanIdentity: PLAN_ID,
    automatic: true,
    dryRun: false,
    message: 'BugDrop is out, {mention}',
    mentionUserId: '123456789',
    imageUrl: 'https://example.com/release.png',
    ...overrides,
  });
}

describe('notification identity and payload', () => {
  it('binds automatic deduplication to release-plan identity and tag', () => {
    const first = automatic();
    const second = automatic();
    expect(first.notificationKey).toBe(second.notificationKey);
    expect(first.notificationKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(automatic({ tag: 'v1.56.1' }).notificationKey).not.toBe(first.notificationKey);
  });

  it('requires a release-plan identity for automatic sends but permits manual tag retries', () => {
    expect(() => automatic({ releasePlanIdentity: '' })).toThrow(DiscordReleaseError);
    expect(
      normalizeNotificationRequest({
        repository: 'mean-weasel/bugdrop',
        tag: 'v1.56.0',
        automatic: false,
        dryRun: true,
      })
    ).toMatchObject({ automatic: false, tag: 'v1.56.0' });
  });

  it('retains bounded custom fields and allow-listed mention behavior', () => {
    const payload = buildDiscordPayload(release(), automatic());
    expect(payload.content).toContain('<@123456789>');
    expect(payload.allowed_mentions).toEqual({ parse: [], users: ['123456789'] });
    expect(payload.embeds[0]).toMatchObject({
      url: release().html_url,
      image: { url: 'https://example.com/release.png' },
    });
  });
});

describe('deduplication, dry run, and retry', () => {
  it('skips an already completed automatic identity but not an operator retry', () => {
    const request = automatic();
    expect(
      resolveNotificationAttempt({ request, completedKeys: [request.notificationKey] })
    ).toEqual({ status: 'duplicate', notificationKey: request.notificationKey });
    const manual = normalizeNotificationRequest({
      repository: 'mean-weasel/bugdrop',
      tag: 'v1.56.0',
      automatic: false,
      dryRun: false,
    });
    expect(
      resolveNotificationAttempt({ request: manual, completedKeys: [manual.notificationKey] })
    ).toMatchObject({ status: 'send' });
  });

  it('returns a payload without sending during dry run', async () => {
    const fetchImpl = vi.fn();
    const request = automatic({ dryRun: true });
    const result = await executeDiscordNotification({
      request,
      release: release(),
      webhookUrl: '',
      fetchImpl,
      completedKeys: [],
    });
    expect(result).toMatchObject({ status: 'dry-run' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails visibly on webhook failure and remains independently retryable', async () => {
    const request = automatic();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    await expect(
      sendDiscordNotification({
        webhookUrl: 'https://discord.com/api/webhooks/example/token',
        payload: buildDiscordPayload(release(), request),
        fetchImpl,
      })
    ).rejects.toMatchObject({ code: 'WEBHOOK_FAILED' });
    expect(resolveNotificationAttempt({ request, completedKeys: [] })).toMatchObject({
      status: 'send',
    });
  });

  it('keeps an oversized webhook error typed and safely truncates its details', async () => {
    await expect(
      sendDiscordNotification({
        webhookUrl: 'https://discord.com/api/webhooks/example/token',
        payload: {},
        fetchImpl: vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          text: async () => 'x'.repeat(1000),
        }),
      })
    ).rejects.toMatchObject({
      code: 'WEBHOOK_FAILED',
      details: { responseBody: 'x'.repeat(200) },
    });
  });

  it('fails rather than silently succeeding when a real send lacks a webhook', async () => {
    await expect(
      executeDiscordNotification({
        request: automatic(),
        release: release(),
        webhookUrl: '',
        fetchImpl: vi.fn(),
        completedKeys: [],
      })
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_SEND_FAILED',
      details: {
        causeCode: 'MISSING_WEBHOOK',
        retryInstruction:
          'Retry workflow_dispatch for tag v1.56.0 with automatic=false and dry_run=false.',
      },
    });
  });
});
