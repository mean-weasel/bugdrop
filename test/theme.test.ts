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
