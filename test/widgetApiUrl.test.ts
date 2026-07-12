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

/**
 * Tests for the widget's tenant-scoped apiUrl derivation from data-tenant.
 *
 * When data-tenant is present and matches ^[a-z0-9-]{3,32}$, the widget
 * appends /t/{key} to the base apiUrl. Mirrors the logic in
 * src/widget/index.ts.
 */
const tenantKeyPattern = /^[a-z0-9-]{3,32}$/;

function deriveTenantApiUrl(scriptSrc: string, rawTenant: string | undefined): string {
  const tenantKey = rawTenant && tenantKeyPattern.test(rawTenant) ? rawTenant : undefined;
  const baseApiUrl = deriveApiUrl(scriptSrc);
  return baseApiUrl && tenantKey ? `${baseApiUrl}/t/${tenantKey}` : baseApiUrl;
}

describe('Widget tenant-scoped apiUrl derivation', () => {
  const base = 'https://bugdrop.neonwatty.workers.dev';
  const scriptSrc = `${base}/widget.v1.js`;

  it('leaves apiUrl unchanged when data-tenant is absent', () => {
    expect(deriveTenantApiUrl(scriptSrc, undefined)).toBe(`${base}/api`);
  });

  it('appends /t/{key} when data-tenant is a valid key', () => {
    expect(deriveTenantApiUrl(scriptSrc, 'acme')).toBe(`${base}/api/t/acme`);
  });

  it('accepts a key at the minimum length (3 chars)', () => {
    expect(deriveTenantApiUrl(scriptSrc, 'abc')).toBe(`${base}/api/t/abc`);
  });

  it('accepts a key at the maximum length (32 chars)', () => {
    const key = 'a'.repeat(32);
    expect(deriveTenantApiUrl(scriptSrc, key)).toBe(`${base}/api/t/${key}`);
  });

  it('ignores an invalid data-tenant (too short)', () => {
    expect(deriveTenantApiUrl(scriptSrc, 'ab')).toBe(`${base}/api`);
  });

  it('ignores an invalid data-tenant (too long)', () => {
    expect(deriveTenantApiUrl(scriptSrc, 'a'.repeat(33))).toBe(`${base}/api`);
  });

  it('ignores an invalid data-tenant (uppercase letters)', () => {
    expect(deriveTenantApiUrl(scriptSrc, 'Acme-Corp')).toBe(`${base}/api`);
  });

  it('ignores an invalid data-tenant (disallowed characters)', () => {
    expect(deriveTenantApiUrl(scriptSrc, 'acme_corp')).toBe(`${base}/api`);
  });
});
