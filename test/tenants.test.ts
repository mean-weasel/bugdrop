import { describe, expect, it } from 'vitest';
import {
  tenantToDataAttributes,
  validateTenantConfig,
  type TenantConfig,
} from '../src/lib/tenants';

function baseTenant(overrides: Partial<TenantConfig> = {}): unknown {
  return {
    version: 1,
    key: 'acme',
    name: 'Acme Inc',
    repo: 'acme/website',
    origins: ['https://app.acme.com'],
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateTenantConfig', () => {
  it('accepts a minimal valid tenant', () => {
    const result = validateTenantConfig(baseTenant());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.key).toBe('acme');
      expect(result.value.theme).toBeUndefined();
    }
  });

  it('accepts a fully populated tenant covering every field family', () => {
    const result = validateTenantConfig(
      baseTenant({
        origins: ['https://app.acme.com', 'http://localhost:3000'],
        theme: {
          color: '#2563eb',
          bg: '#ffffff',
          text: '#111111',
          font: 'Inter, sans-serif',
          radius: '8',
          borderWidth: '1',
          borderColor: '#e2e8f0',
          shadow: 'soft',
          icon: 'https://cdn.acme.com/icon.svg',
          label: 'Feedback',
          position: 'bottom-left',
          mode: 'dark',
        },
        behavior: {
          locale: 'en',
          showName: true,
          requireName: false,
          showEmail: true,
          requireEmail: false,
          screenshot: 'auto',
          welcome: 'always',
          showIssueLink: 'always',
          sendConsoleLogs: true,
          buttonDismissible: true,
          dismissDuration: 7,
          showRestore: true,
          categoryLabels: { bug: 'Bug', idea: ['Idea', 'Feature Request'] },
        },
        rate: { perIp: 10, perRepo: 100 },
      })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.theme?.color).toBe('#2563eb');
      expect(result.value.behavior?.categoryLabels).toEqual({
        bug: 'Bug',
        idea: ['Idea', 'Feature Request'],
      });
      expect(result.value.rate).toEqual({ perIp: 10, perRepo: 100 });
    }
  });

  it('rejects non-object input', () => {
    expect(validateTenantConfig(null).ok).toBe(false);
    expect(validateTenantConfig('acme').ok).toBe(false);
    expect(validateTenantConfig([]).ok).toBe(false);
  });

  it('rejects unknown top-level fields', () => {
    const result = validateTenantConfig(baseTenant({ extra: 'nope' } as never));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('extra'))).toBe(true);
    }
  });

  it('rejects unknown fields inside theme, behavior, and rate', () => {
    const result = validateTenantConfig(
      baseTenant({
        theme: { bogus: 'x' } as never,
        behavior: { bogus: 'x' } as never,
        rate: { bogus: 1 } as never,
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('theme.bogus'))).toBe(true);
      expect(result.errors.some(e => e.includes('behavior.bogus'))).toBe(true);
      expect(result.errors.some(e => e.includes('rate.bogus'))).toBe(true);
    }
  });

  it('rejects version other than 1', () => {
    expect(validateTenantConfig(baseTenant({ version: 2 as never })).ok).toBe(false);
    expect(validateTenantConfig(baseTenant({ version: undefined as never })).ok).toBe(false);
  });

  describe('key format', () => {
    it.each(['acm', 'acme', 'acme-inc', 'a1b', 'abc-def-ghi'])('accepts %s', key => {
      expect(validateTenantConfig(baseTenant({ key })).ok).toBe(true);
    });

    it.each([
      'A', // too short, uppercase
      'a', // too short
      'ab', // too short (pattern [a-z0-9] + 1..30 + [a-z0-9] means min length 3)
      '-abc', // cannot start with hyphen
      'abc-', // cannot end with hyphen
      'ABC', // uppercase not allowed
      'ab_c', // underscore not allowed
      '',
    ])('rejects %s', key => {
      const result = validateTenantConfig(baseTenant({ key }));
      expect(result.ok).toBe(false);
    });
  });

  describe('origins', () => {
    it('accepts https origins and http://localhost with optional port', () => {
      expect(validateTenantConfig(baseTenant({ origins: ['https://example.com'] })).ok).toBe(true);
      expect(validateTenantConfig(baseTenant({ origins: ['http://localhost:5173'] })).ok).toBe(
        true
      );
      expect(validateTenantConfig(baseTenant({ origins: ['http://localhost'] })).ok).toBe(true);
    });

    it('rejects plain http origins that are not localhost', () => {
      expect(validateTenantConfig(baseTenant({ origins: ['http://example.com'] })).ok).toBe(false);
    });

    it('rejects origins with paths, query strings, or wildcards', () => {
      expect(validateTenantConfig(baseTenant({ origins: ['https://example.com/app'] })).ok).toBe(
        false
      );
      expect(validateTenantConfig(baseTenant({ origins: ['https://example.com?x=1'] })).ok).toBe(
        false
      );
      expect(validateTenantConfig(baseTenant({ origins: ['https://*.example.com'] })).ok).toBe(
        false
      );
    });

    it('rejects an empty origins array', () => {
      expect(validateTenantConfig(baseTenant({ origins: [] })).ok).toBe(false);
    });
  });

  describe('repo format', () => {
    it.each(['octocat/hello-world', 'acme/website'])('accepts %s', repo => {
      expect(validateTenantConfig(baseTenant({ repo })).ok).toBe(true);
    });

    it.each(['', 'no-slash', 'a/b/c', '/repo', 'owner/'])('rejects %s', repo => {
      expect(validateTenantConfig(baseTenant({ repo })).ok).toBe(false);
    });
  });

  it('rejects an invalid status', () => {
    expect(validateTenantConfig(baseTenant({ status: 'disabled' as never })).ok).toBe(false);
  });

  it('rejects malformed timestamps', () => {
    expect(validateTenantConfig(baseTenant({ createdAt: 'not-a-date' })).ok).toBe(false);
    expect(validateTenantConfig(baseTenant({ updatedAt: '2026-01-01' })).ok).toBe(false);
  });

  it('rejects wrong-typed theme enum values', () => {
    expect(validateTenantConfig(baseTenant({ theme: { shadow: 'blurry' } as never })).ok).toBe(
      false
    );
    expect(validateTenantConfig(baseTenant({ theme: { position: 'top' } as never })).ok).toBe(
      false
    );
    expect(validateTenantConfig(baseTenant({ theme: { mode: 'sepia' } as never })).ok).toBe(false);
  });

  it('rejects wrong-typed behavior fields', () => {
    expect(validateTenantConfig(baseTenant({ behavior: { showName: 'true' } as never })).ok).toBe(
      false
    );
    expect(
      validateTenantConfig(baseTenant({ behavior: { dismissDuration: -1 } as never })).ok
    ).toBe(false);
    expect(
      validateTenantConfig(baseTenant({ behavior: { categoryLabels: { bug: 42 } } as never })).ok
    ).toBe(false);
  });

  it('rejects wrong-typed rate fields', () => {
    expect(validateTenantConfig(baseTenant({ rate: { perIp: 0 } as never })).ok).toBe(false);
    expect(validateTenantConfig(baseTenant({ rate: { perRepo: -5 } as never })).ok).toBe(false);
  });

  it('accepts a v1 envelope in authTokenSecretEnc and carries it through', () => {
    const result = validateTenantConfig(
      baseTenant({ authTokenSecretEnc: 'v1.abc-123.def_456' } as never)
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.authTokenSecretEnc).toBe('v1.abc-123.def_456');
    }
  });

  it('rejects a non-envelope authTokenSecretEnc (plaintext must never be storable)', () => {
    const result = validateTenantConfig(
      baseTenant({ authTokenSecretEnc: 'raw-plaintext-secret' } as never)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some(e => e.includes('v1 AES-GCM envelope'))).toBe(true);
    }
  });
});

describe('tenantToDataAttributes', () => {
  it('always includes repo', () => {
    const result = validateTenantConfig(baseTenant());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tenantToDataAttributes(result.value)).toEqual({ repo: 'acme/website' });
  });

  it('maps every theme field to its kebab-case data attribute', () => {
    const result = validateTenantConfig(
      baseTenant({
        theme: {
          color: '#2563eb',
          bg: '#fff',
          text: '#111',
          font: 'Inter',
          radius: '8',
          borderWidth: '1',
          borderColor: '#e2e8f0',
          shadow: 'hard',
          icon: 'none',
          label: 'Feedback',
          position: 'bottom-left',
          mode: 'light',
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tenantToDataAttributes(result.value)).toEqual({
      repo: 'acme/website',
      color: '#2563eb',
      bg: '#fff',
      text: '#111',
      font: 'Inter',
      radius: '8',
      'border-width': '1',
      'border-color': '#e2e8f0',
      shadow: 'hard',
      icon: 'none',
      label: 'Feedback',
      position: 'bottom-left',
      theme: 'light',
    });
  });

  it('maps every behavior field to its kebab-case data attribute, serializing booleans/numbers as strings', () => {
    const result = validateTenantConfig(
      baseTenant({
        behavior: {
          locale: 'pt',
          showName: true,
          requireName: false,
          showEmail: true,
          requireEmail: false,
          screenshot: 'required',
          welcome: 'never',
          showIssueLink: 'never',
          sendConsoleLogs: false,
          buttonDismissible: true,
          dismissDuration: 3,
          showRestore: false,
          categoryLabels: { bug: 'Bug' },
        },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(tenantToDataAttributes(result.value)).toEqual({
      repo: 'acme/website',
      locale: 'pt',
      'show-name': 'true',
      'require-name': 'false',
      'show-email': 'true',
      'require-email': 'false',
      screenshot: 'required',
      welcome: 'never',
      'show-issue-link': 'never',
      'send-console-logs': 'false',
      'button-dismissible': 'true',
      'dismiss-duration': '3',
      'show-restore': 'false',
      'category-labels': JSON.stringify({ bug: 'Bug' }),
    });
  });
});
