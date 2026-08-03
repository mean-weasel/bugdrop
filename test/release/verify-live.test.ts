import { describe, expect, it, vi } from 'vitest';

import {
  LiveVerificationError,
  observeLiveSnapshot,
  pollLiveVerification,
  verifyLiveSnapshot,
} from '../../scripts/release/verify-live.mjs';

const SHA = 'a'.repeat(40);
const WIDGET_HASH = 'b'.repeat(64);
const MANIFEST_HASH = 'c'.repeat(64);
const RETAINED_HASH = 'd'.repeat(64);

function expected() {
  return {
    targetSha: SHA,
    version: '1.56.0',
    origin: 'https://bugdrop.example.com',
    widgetSha256: WIDGET_HASH,
    manifestSha256: MANIFEST_HASH,
    exactFilename: 'widget.v1.56.0.js',
    aliasFilenames: ['widget.js', 'widget.v1.js', 'widget.v1.56.js'],
    retainedAssets: { 'widget.v1.55.0.js': RETAINED_HASH },
  };
}

function snapshot() {
  return {
    health: { status: 'ok', environment: 'production', buildSha: SHA },
    assetHashes: {
      'widget.js': WIDGET_HASH,
      'widget.v1.js': WIDGET_HASH,
      'widget.v1.56.js': WIDGET_HASH,
      'widget.v1.56.0.js': WIDGET_HASH,
      'widget.v1.55.0.js': RETAINED_HASH,
      'versions.json': MANIFEST_HASH,
    },
    manifest: {
      authoritative: true,
      current: '1.56.0',
      mode: 'release',
      artifacts: {
        'v1.55.0': { filename: 'widget.v1.55.0.js', sha256: RETAINED_HASH },
        'v1.56.0': { filename: 'widget.v1.56.0.js', sha256: WIDGET_HASH },
      },
      versions: {
        v1: 'widget.v1.js',
        'v1.55.0': 'widget.v1.55.0.js',
        'v1.56': 'widget.v1.56.js',
        'v1.56.0': 'widget.v1.56.0.js',
      },
    },
  };
}

describe('explicit live verification', () => {
  it('verifies health, exact and mutable aliases, manifest, and retention together', () => {
    expect(verifyLiveSnapshot(expected(), snapshot())).toMatchObject({
      status: 'verified',
      targetSha: SHA,
      version: '1.56.0',
    });
  });

  it.each([
    ['environment', observed => (observed.health.environment = 'preview')],
    ['build SHA', observed => (observed.health.buildSha = '0'.repeat(40))],
    ['latest hash', observed => (observed.assetHashes['widget.js'] = '0'.repeat(64))],
    ['exact hash', observed => (observed.assetHashes['widget.v1.56.0.js'] = '0'.repeat(64))],
    ['major alias', observed => (observed.assetHashes['widget.v1.js'] = '0'.repeat(64))],
    ['manifest hash', observed => (observed.assetHashes['versions.json'] = '0'.repeat(64))],
    ['manifest version', observed => (observed.manifest.current = '1.55.0')],
    ['retained hash', observed => (observed.assetHashes['widget.v1.55.0.js'] = '0'.repeat(64))],
  ])('fails closed on %s mismatch', (_name, mutate) => {
    const observed = snapshot();
    mutate(observed);
    expect(() => verifyLiveSnapshot(expected(), observed)).toThrow(LiveVerificationError);
  });

  it('rejects implicit or unsafe origin and incomplete identity inputs', () => {
    expect(() =>
      verifyLiveSnapshot({ ...expected(), origin: 'http://bugdrop.example.com' }, snapshot())
    ).toThrow(/INVALID_ORIGIN/);
    expect(() => verifyLiveSnapshot({ ...expected(), targetSha: '' }, snapshot())).toThrow(
      /INVALID_SHA/
    );
  });
});

describe('polling and scheduled observation', () => {
  it('retries a mismatch and succeeds only on the exact snapshot', async () => {
    const wrong = snapshot();
    wrong.health.buildSha = '0'.repeat(40);
    const provider = vi.fn().mockResolvedValueOnce(wrong).mockResolvedValueOnce(snapshot());
    await expect(
      pollLiveVerification({
        expected: expected(),
        snapshotProvider: provider,
        maxAttempts: 2,
        sleep: async () => {},
      })
    ).resolves.toMatchObject({ status: 'verified' });
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('surfaces timeout as failure with the last typed mismatch', async () => {
    const wrong = snapshot();
    wrong.assetHashes['widget.js'] = '0'.repeat(64);
    await expect(
      pollLiveVerification({
        expected: expected(),
        snapshotProvider: async () => wrong,
        maxAttempts: 2,
        sleep: async () => {},
      })
    ).rejects.toMatchObject({ code: 'LIVE_VERIFICATION_TIMEOUT' });
  });

  it('bounds a hung live request and reports the timeout as the final cause', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }) as typeof fetch;
    try {
      await expect(
        pollLiveVerification({ expected: expected(), maxAttempts: 1, requestTimeoutMs: 1 })
      ).rejects.toMatchObject({
        code: 'LIVE_VERIFICATION_TIMEOUT',
        details: { lastCode: 'LIVE_FETCH_TIMEOUT' },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('records scheduled production identity as observation, not plan verification', () => {
    expect(observeLiveSnapshot('https://bugdrop.example.com', snapshot())).toMatchObject({
      status: 'observed',
      environment: 'production',
      buildSha: SHA,
      currentVersion: '1.56.0',
      verifiedAgainstPlan: false,
    });
  });
});
