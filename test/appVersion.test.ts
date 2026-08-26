import { describe, expect, it } from 'vitest';
import { MAX_APP_VERSION_CHARS, parseAppVersion } from '../src/app-version';

describe('application version metadata', () => {
  it('normalizes a bounded printable version', () => {
    expect(parseAppVersion('  1.2.3+desktop.4  ')).toBe('1.2.3+desktop.4');
    expect(parseAppVersion('v'.repeat(MAX_APP_VERSION_CHARS))).toBe(
      'v'.repeat(MAX_APP_VERSION_CHARS)
    );
    expect(parseAppVersion('🚀'.repeat(MAX_APP_VERSION_CHARS))).toBe(
      '🚀'.repeat(MAX_APP_VERSION_CHARS)
    );
  });

  it.each([
    undefined,
    null,
    123,
    '',
    '   ',
    '1.2.3\nforged',
    '1.2.3\u007fforged',
    '1.2.3\u0085forged',
    '1.2.3\u202eforged',
    '1.2.3\u2028forged',
    'v'.repeat(MAX_APP_VERSION_CHARS + 1),
    '🚀'.repeat(MAX_APP_VERSION_CHARS + 1),
  ])('rejects invalid version metadata: %j', value => {
    expect(parseAppVersion(value)).toBeUndefined();
  });
});
