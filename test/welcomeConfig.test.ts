import { describe, it, expect } from 'vitest';

type WelcomeMode = 'once' | 'always' | 'never';

function parseWelcome(value: string | undefined): WelcomeMode {
  if (value === 'false' || value === 'never') return 'never';
  if (value === 'always') return 'always';
  return 'once';
}

describe('Welcome config parsing', () => {
  it('defaults to "once" when omitted', () => {
    expect(parseWelcome(undefined)).toBe('once');
  });

  it('returns "never" for "false"', () => {
    expect(parseWelcome('false')).toBe('never');
  });

  it('returns "never" for "never"', () => {
    expect(parseWelcome('never')).toBe('never');
  });

  it('returns "always" for "always"', () => {
    expect(parseWelcome('always')).toBe('always');
  });

  it('defaults to "once" for unrecognized values', () => {
    expect(parseWelcome('banana')).toBe('once');
    expect(parseWelcome('')).toBe('once');
  });
});
