import { describe, it, expect } from 'vitest';

/**
 * Tests for the widget's apiUrl derivation from script src.
 *
 * The widget computes its API base URL by replacing the widget filename
 * in the script's src attribute. This must work for all versioned paths:
 *   /widget.js, /widget.v1.js, /widget.v1.1.js, /widget.v1.1.0.js
 *
 * Regression: a literal .replace('/widget.js', '/api') silently failed
 * for versioned paths, causing malformed API URLs like
 * /widget.v1.js/check/owner/repo instead of /api/check/owner/repo.
 */

// Extract the regex used in src/widget/index.ts for apiUrl derivation
const widgetPathPattern = /\/widget(?:\.v[\d.]+)?\.js$/;

function deriveApiUrl(scriptSrc: string): string {
  return scriptSrc.replace(widgetPathPattern, '/api');
}

describe('Widget apiUrl derivation', () => {
  const base = 'https://bugdrop.neonwatty.workers.dev';

  it('handles /widget.js (unversioned)', () => {
    expect(deriveApiUrl(`${base}/widget.js`)).toBe(`${base}/api`);
  });

  it('handles /widget.v1.js (major version)', () => {
    expect(deriveApiUrl(`${base}/widget.v1.js`)).toBe(`${base}/api`);
  });

  it('handles /widget.v1.1.js (minor version)', () => {
    expect(deriveApiUrl(`${base}/widget.v1.1.js`)).toBe(`${base}/api`);
  });

  it('handles /widget.v1.1.0.js (patch version)', () => {
    expect(deriveApiUrl(`${base}/widget.v1.1.0.js`)).toBe(`${base}/api`);
  });

  it('handles double-digit versions', () => {
    expect(deriveApiUrl(`${base}/widget.v12.34.56.js`)).toBe(`${base}/api`);
  });

  it('returns original URL if pattern does not match', () => {
    const url = `${base}/other-script.js`;
    expect(deriveApiUrl(url)).toBe(url);
  });
});
