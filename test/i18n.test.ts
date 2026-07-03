import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveLocale, setLocale, t } from '../src/widget/i18n';
import { en } from '../src/widget/locales/en';
import { nl } from '../src/widget/locales/nl';
import { pl } from '../src/widget/locales/pl';

afterEach(() => {
  setLocale('en');
  vi.restoreAllMocks();
});

describe('resolveLocale', () => {
  it('resolves exactly matching supported locales', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('nl')).toBe('nl');
    expect(resolveLocale('pl')).toBe('pl');
  });

  it('resolves region subtags to the base language', () => {
    expect(resolveLocale('nl-NL')).toBe('nl');
    expect(resolveLocale('pl-PL')).toBe('pl');
    expect(resolveLocale('en-GB')).toBe('en');
  });

  it('resolves underscore region formats to the base language', () => {
    expect(resolveLocale('nl_NL')).toBe('nl');
    expect(resolveLocale('pl_PL')).toBe('pl');
  });

  it('is case-insensitive', () => {
    expect(resolveLocale('NL')).toBe('nl');
    expect(resolveLocale('Pl-pl')).toBe('pl');
    expect(resolveLocale('EN-us')).toBe('en');
  });

  it('falls back to English and warns for unsupported locales', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(resolveLocale('de')).toBe('en');

    expect(warn).toHaveBeenCalledWith(
      '[BugDrop] Unsupported data-locale "de"; falling back to English.'
    );
  });

  it('falls back to English without warning when no locale is provided', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale('')).toBe('en');

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('setLocale and t', () => {
  it('defaults to the English dictionary', () => {
    expect(t()).toBe(en);
  });

  it('switches the active dictionary', () => {
    setLocale('nl');
    expect(t()).toBe(nl);

    setLocale('pl');
    expect(t()).toBe(pl);
  });
});

describe('locale dictionaries', () => {
  const enKeys = Object.keys(en).sort();

  it.each([
    ['nl', nl],
    ['pl', pl],
  ] as const)('%s has exactly the same keys as en', (_name, dictionary) => {
    expect(Object.keys(dictionary).sort()).toEqual(enKeys);
  });

  it.each([
    ['nl', nl],
    ['pl', pl],
  ] as const)('%s entries have the same type as their en counterparts', (_name, dictionary) => {
    for (const key of enKeys) {
      expect(typeof dictionary[key as keyof typeof en]).toBe(typeof en[key as keyof typeof en]);
    }
  });
});
