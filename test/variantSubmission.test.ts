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

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
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
    fetchMock.mockResolvedValueOnce(
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
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
