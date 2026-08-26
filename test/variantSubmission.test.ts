// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { submitVariant } from '../src/widget/variants/submission';
import type { VariantConfig } from '../src/widget/variants/public-types';

const config: VariantConfig = {
  id: 'export-review',
  presentation: { kind: 'inline' },
  content: { title: 'Review the export' },
  fields: [{ id: 'rating', type: 'rating', label: 'Rating', required: true, scale: 5 }],
  issue: {
    classification: 'feedback',
    title: 'Export review: {{rating}}/5',
    sections: [{ heading: 'Rating', field: 'rating', format: 'stars' }],
  },
};

const transport = {
  repo: 'Owner/Repo',
  apiUrl: 'https://api.example.test/v1',
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

describe('variant submission transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-03T04:05:06.789Z'));
    window.history.replaceState({}, '', '/account/export?token=secret-query#private-fragment');
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1440 },
      innerHeight: { configurable: true, value: 900 },
      devicePixelRatio: { configurable: true, value: 2 },
    });
    Object.defineProperties(navigator, {
      userAgent: {
        configurable: true,
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/126.0.0.0 Safari/537.36',
      },
      language: { configurable: true, value: 'en-GB' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the exact URL, method, headers, authentication, payload, and redacted metadata', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: true } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 37,
          issueUrl: 'https://github.com/owner/repo/issues/37',
          isPublic: true,
          labelMappingWarnings: ['fallback label used'],
        })
      );
    const tokenProvider = vi.fn().mockResolvedValue('private-token');

    await expect(
      submitVariant(
        { ...transport, authTokenProvider: tokenProvider, appVersion: '1.2.3' },
        config,
        { rating: 4 },
        { context: { export_id: 'exp-42' }, submissionId: 'submission-fixed' }
      )
    ).resolves.toEqual({
      issueNumber: 37,
      issueUrl: 'https://github.com/owner/repo/issues/37',
      isPublic: true,
      labelMappingWarnings: ['fallback label used'],
    });

    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.example.test/v1/health');
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('https://api.example.test/v1/feedback');
    expect(init).toEqual({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer private-token',
      },
      body: expect.any(String),
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: 'bugdrop.variant-submission',
      schemaVersion: 1,
      repo: 'Owner/Repo',
      variantId: 'export-review',
      submissionId: 'submission-fixed',
      issue: {
        title: 'Export review: 4/5',
        classification: 'feedback',
        sections: [{ heading: 'Rating', value: '★★★★☆ (4/5)', format: 'text' }],
      },
      metadata: {
        url: 'http://localhost:3000/account/export',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
        timestamp: '2026-02-03T04:05:06.789Z',
        appVersion: '1.2.3',
        browser: { name: 'Chrome', version: '126.0.0.0' },
        os: { name: 'macOS', version: '14.5' },
        devicePixelRatio: 2,
        language: 'en-GB',
      },
    });
    expect(String(init?.body)).not.toContain('secret-query');
    expect(String(init?.body)).not.toContain('private-fragment');
  });

  it('uses a secure random UUID and preserves an already-prefixed bearer token', async () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '123e4567-e89b-42d3-a456-426614174000'
    );
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        issueNumber: 8,
        issueUrl: 'https://github.com/owner/repo/issues/8',
        isPublic: false,
      })
    );

    await submitVariant(
      { ...transport, authTokenProvider: () => 'Bearer existing-token' },
      config,
      { rating: 5 }
    );

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer existing-token',
    });
    expect(JSON.parse(String(init?.body)).submissionId).toBe(
      '123e4567-e89b-42d3-a456-426614174000'
    );
  });

  it('omits appVersion for an older Worker and detects an upgrade on the next submission', async () => {
    const legacyTransport = { ...transport, apiUrl: 'https://legacy-api.example.test/v1' };
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' })).mockResolvedValueOnce(
      jsonResponse({
        success: true,
        issueNumber: 38,
        issueUrl: 'https://github.com/owner/repo/issues/38',
        isPublic: true,
      })
    );

    await expect(
      submitVariant(
        { ...legacyTransport, appVersion: '1.2.3' },
        config,
        { rating: 4 },
        { submissionId: 'legacy-worker-retry' }
      )
    ).resolves.toMatchObject({ issueNumber: 38 });

    expect(fetchMock.mock.calls[0]![0]).toBe('https://legacy-api.example.test/v1/health');
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).not.toHaveProperty(
      'appVersion'
    );

    fetchMock.mockClear();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: true } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 40,
          issueUrl: 'https://github.com/owner/repo/issues/40',
          isPublic: true,
        })
      );
    await submitVariant(
      { ...legacyTransport, appVersion: '1.2.5' },
      config,
      { rating: 5 },
      { submissionId: 'legacy-worker-upgraded' }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).toMatchObject({
      appVersion: '1.2.5',
    });
  });

  it('reprobes supported endpoints so a Worker rollback does not spend fallback quota', async () => {
    const rollbackTransport = {
      ...transport,
      apiUrl: 'https://rollback-api.example.test/v1',
      appVersion: '1.2.3',
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: true } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 48,
          issueUrl: 'https://github.com/owner/repo/issues/48',
          isPublic: true,
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 49,
          issueUrl: 'https://github.com/owner/repo/issues/49',
          isPublic: true,
        })
      );

    await submitVariant(rollbackTransport, config, { rating: 4 });
    await submitVariant(rollbackTransport, config, { rating: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).toHaveProperty(
      'appVersion'
    );
    expect(JSON.parse(String(fetchMock.mock.calls[3]![1]?.body)).metadata).not.toHaveProperty(
      'appVersion'
    );
  });

  it('retries once without appVersion after a stale positive capability result', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: true } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Unknown structured metadata property: appVersion' }, false)
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 41,
          issueUrl: 'https://github.com/owner/repo/issues/41',
          isPublic: true,
        })
      );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      submitVariant(
        { ...transport, apiUrl: 'https://stale-api.example.test/v1', appVersion: '1.2.3' },
        config,
        { rating: 4 }
      )
    ).resolves.toMatchObject({ issueNumber: 41 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).toHaveProperty(
      'appVersion'
    );
    expect(JSON.parse(String(fetchMock.mock.calls[2]![1]?.body)).metadata).not.toHaveProperty(
      'appVersion'
    );
    expect(warning).toHaveBeenCalledWith(
      '[BugDrop] Worker does not support app-version metadata; retrying without it.'
    );
  });

  it('does not retry an appVersion rejection from a non-validation response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: true } })
      )
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Unknown structured metadata property: appVersion' }, false, 500)
      );

    await expect(
      submitVariant(
        { ...transport, apiUrl: 'https://failing-api.example.test/v1', appVersion: '1.2.3' },
        config,
        { rating: 4 }
      )
    ).rejects.toThrow('Unknown structured metadata property: appVersion');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('bounds a stalled capability probe and submits without appVersion', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 42,
          issueUrl: 'https://github.com/owner/repo/issues/42',
          isPublic: true,
        })
      );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const submission = submitVariant(
      { ...transport, apiUrl: 'https://stalled-api.example.test/v1', appVersion: '1.2.3' },
      config,
      { rating: 4 }
    );
    await vi.advanceTimersByTimeAsync(1500);
    await expect(submission).resolves.toMatchObject({ issueNumber: 42 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).not.toHaveProperty(
      'appVersion'
    );
    expect(warning).toHaveBeenCalledWith(
      '[BugDrop] App-version capability probe failed; submitting without it.',
      expect.objectContaining({ name: 'AbortError' })
    );
  });

  it('does not cache an indeterminate capability response', async () => {
    const indeterminateTransport = {
      ...transport,
      apiUrl: 'https://indeterminate-api.example.test/v1',
      appVersion: '1.2.3',
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, false, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 43,
          issueUrl: 'https://github.com/owner/repo/issues/43',
          isPublic: true,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: true } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 44,
          issueUrl: 'https://github.com/owner/repo/issues/44',
          isPublic: true,
        })
      );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await submitVariant(indeterminateTransport, config, { rating: 4 });
    await submitVariant(indeterminateTransport, config, { rating: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).not.toHaveProperty(
      'appVersion'
    );
    expect(JSON.parse(String(fetchMock.mock.calls[3]![1]?.body)).metadata).toMatchObject({
      appVersion: '1.2.3',
    });
    expect(warning).toHaveBeenCalledWith(
      '[BugDrop] App-version capability probe returned HTTP 503; submitting without it.'
    );
  });

  it('does not cache a malformed capability response', async () => {
    const malformedTransport = {
      ...transport,
      apiUrl: 'https://malformed-api.example.test/v1',
      appVersion: '1.2.3',
    };
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: 'true' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 46,
          issueUrl: 'https://github.com/owner/repo/issues/46',
          isPublic: true,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: 'ok', capabilities: { appVersionMetadata: true } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 47,
          issueUrl: 'https://github.com/owner/repo/issues/47',
          isPublic: true,
        })
      );
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await submitVariant(malformedTransport, config, { rating: 4 });
    await submitVariant(malformedTransport, config, { rating: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).not.toHaveProperty(
      'appVersion'
    );
    expect(JSON.parse(String(fetchMock.mock.calls[3]![1]?.body)).metadata).toMatchObject({
      appVersion: '1.2.3',
    });
    expect(warning).toHaveBeenCalledWith(
      '[BugDrop] App-version capability probe returned an invalid response; submitting without it.'
    );
  });

  it('keeps the capability timeout active while reading the response body', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockImplementationOnce((_input, init) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError'))
              );
            }),
        } as Response)
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          issueNumber: 45,
          issueUrl: 'https://github.com/owner/repo/issues/45',
          isPublic: true,
        })
      );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const submission = submitVariant(
      { ...transport, apiUrl: 'https://stalled-body.example.test/v1', appVersion: '1.2.3' },
      config,
      { rating: 4 }
    );
    await vi.advanceTimersByTimeAsync(1500);

    await expect(submission).resolves.toMatchObject({ issueNumber: 45 });
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).metadata).not.toHaveProperty(
      'appVersion'
    );
  });

  it('falls back to cryptographic random bytes when randomUUID is unavailable', async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        issueNumber: 9,
        issueUrl: 'https://github.com/owner/repo/issues/9',
        isPublic: true,
      })
    );

    await submitVariant(transport, config, { rating: 3 });

    expect(getRandomValues).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body)).submissionId).toBe('000102030405060708090a0b0c0d0e0f');
  });

  it('fails before transport when no secure identifier source exists', async () => {
    vi.stubGlobal('crypto', {});

    await expect(submitVariant(transport, config, { rating: 3 })).rejects.toThrow(
      'cryptographically secure random generator'
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [
      {
        success: true,
        issueNumber: 0,
        issueUrl: 'https://github.com/owner/repo/issues/0',
        isPublic: true,
      },
    ],
    [
      {
        success: true,
        issueNumber: 7,
        issueUrl: 'https://evil.test/owner/repo/issues/7',
        isPublic: true,
      },
    ],
    [
      {
        success: true,
        issueNumber: 7,
        issueUrl: 'https://github.com/owner/repo/issues/7?token=x',
        isPublic: true,
      },
    ],
    [
      {
        success: true,
        issueNumber: 7,
        issueUrl: 'https://github.com/owner/repo/issues/7',
        isPublic: 'yes',
      },
    ],
  ])('rejects malformed successful Issue responses: %j', async malformed => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(malformed));

    await expect(
      submitVariant(transport, config, { rating: 2 }, { submissionId: 'fixed' })
    ).rejects.toThrow('invalid Issue result');
  });

  it('surfaces explicit server failures and rejects invalid JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ success: false, error: 'Access denied' }, false)
    );
    await expect(
      submitVariant(transport, config, { rating: 2 }, { submissionId: 'server-failure' })
    ).rejects.toThrow('Access denied');

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);
    await expect(
      submitVariant(transport, config, { rating: 2 }, { submissionId: 'bad-json' })
    ).rejects.toThrow('Unexpected token');
  });
});
