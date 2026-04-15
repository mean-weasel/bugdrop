// @vitest-environment jsdom
// test/theme.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getSystemTheme, isValidTheme, resolveTheme } from '../src/widget/theme';

describe('theme module', () => {
  it('module loads', () => {
    expect(typeof resolveTheme).toBe('function');
  });
});

describe('isValidTheme', () => {
  it.each(['light', 'dark', 'auto'])('accepts %s', value => {
    expect(isValidTheme(value)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['unknown string', 'blue'],
    ['undefined', undefined],
    ['null', null],
    ['number', 5],
    ['boolean', true],
    ['object', {}],
    ['array', []],
  ])('rejects %s', (_label, value) => {
    expect(isValidTheme(value)).toBe(false);
  });
});

describe('getSystemTheme', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockMatchMedia(matches: boolean) {
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })) as unknown as typeof window.matchMedia;
  }

  it('returns "dark" when prefers-color-scheme matches', () => {
    mockMatchMedia(true);
    expect(getSystemTheme()).toBe('dark');
  });

  it('returns "light" when prefers-color-scheme does not match', () => {
    mockMatchMedia(false);
    expect(getSystemTheme()).toBe('light');
  });

  it('returns "light" when matchMedia is unavailable', () => {
    // @ts-expect-error - deliberately removing
    delete window.matchMedia;
    expect(getSystemTheme()).toBe('light');
  });
});

describe('resolveTheme', () => {
  it('returns "light" for mode "light"', () => {
    expect(resolveTheme('light')).toBe('light');
  });

  it('returns "dark" for mode "dark"', () => {
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves "auto" via the injected probe (dark)', () => {
    expect(resolveTheme('auto', () => 'dark')).toBe('dark');
  });

  it('resolves "auto" via the injected probe (light)', () => {
    expect(resolveTheme('auto', () => 'light')).toBe('light');
  });

  it('resolves "auto" via the default getSystemTheme fallback when no probe is given', () => {
    // Rely on the real getSystemTheme path with a mocked matchMedia.
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    }) as unknown as typeof window.matchMedia;
    try {
      expect(resolveTheme('auto')).toBe('dark');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('passes "light" for explicit modes through even when getSystem would say dark', () => {
    expect(resolveTheme('light', () => 'dark')).toBe('light');
  });
});
