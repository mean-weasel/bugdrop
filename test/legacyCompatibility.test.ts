import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

interface BundleFixture {
  bundle: string;
  sha256: string;
  rawBytes: number;
  gzipBytes: number;
}

interface CompatibilityManifest {
  provenancePolicy: string;
  bundleBudget: {
    baselineTag: string;
    maxGzipGrowthPercent: number;
    baselineRawBytes: number;
    baselineGzipBytes: number;
    maxGzipBytes: number;
  };
  bundles: Record<string, BundleFixture>;
  legacyBootstrap: {
    hostId: string;
    shadowRootMode: string;
    readyEvent: {
      target: string;
      count: number;
      bubbles: boolean;
      cancelable: boolean;
      detail: null;
    };
    storageKeys: string[];
  };
}

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('test/fixtures/legacy-compat/manifest.json', root), 'utf8')
) as CompatibilityManifest;

describe('immutable legacy compatibility fixtures', () => {
  it.each(Object.entries(manifest.bundles))(
    '%s matches its recorded bytes and hashes',
    (_tag, fixture) => {
      const bundle = readFileSync(new URL(fixture.bundle, root));

      expect(bundle.byteLength).toBe(fixture.rawBytes);
      expect(createHash('sha256').update(bundle).digest('hex')).toBe(fixture.sha256);
      expect(gzipSync(bundle, { level: 9 }).byteLength).toBe(fixture.gzipBytes);
    }
  );

  it('records an explicit reconstruction disclaimer and a deterministic v1.53.1 budget', () => {
    expect(manifest.provenancePolicy).toContain('not claimed to be byte-identical');
    expect(manifest.bundleBudget.baselineTag).toBe('v1.53.1');
    expect(manifest.bundleBudget.maxGzipBytes).toBe(
      Math.ceil(
        manifest.bundleBudget.baselineGzipBytes *
          (1 + manifest.bundleBudget.maxGzipGrowthPercent / 100)
      )
    );
  });

  it('freezes the observable bootstrap and persistence boundary', () => {
    expect(manifest.legacyBootstrap).toEqual({
      hostId: 'bugdrop-host',
      shadowRootMode: 'open',
      readyEvent: {
        target: 'window',
        count: 1,
        bubbles: false,
        cancelable: false,
        detail: null,
      },
      storageKeys: [
        'bugdrop_dismissed',
        'bugdrop_trigger_position_<repo>',
        'bugdrop_welcomed_<repo>',
        'bugdrop_complex_screenshot_skipped_<repo>',
      ],
    });
  });
});
