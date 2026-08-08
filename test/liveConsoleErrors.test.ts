import { describe, expect, it } from 'vitest';
import { isExpectedLiveConsoleError } from '../e2e/live-console-errors';

describe('live console error filtering', () => {
  it.each([
    ['missing repository configuration', 'Missing data-repo attribute'],
    ['Google Fonts resource warning', 'Font https://fonts.gstatic.com/s/font.woff2 returned 403'],
    ['generic CORS failure', 'CORS blocked a cross-origin resource'],
    ['failed font request', 'GET https://fonts.gstatic.com/s/font.woff2 net::ERR_FAILED'],
  ])('accepts the known %s error', (_name, message) => {
    expect(isExpectedLiveConsoleError(message)).toBe(true);
  });

  it.each([
    ['hostname suffix', 'GET https://fonts.gstatic.com.attacker.test/payload.js failed'],
    ['credentials', 'GET https://fonts.gstatic.com@attacker.test/payload.js failed'],
    ['subdomain', 'GET https://cdn.fonts.gstatic.com/font.woff2 failed'],
    ['query parameter', 'GET https://attacker.test/?next=https://fonts.gstatic.com failed'],
    ['plain-text mention', 'Unexpected script from fonts.gstatic.com executed'],
  ])('does not hide an unrelated error containing a %s', (_name, message) => {
    expect(isExpectedLiveConsoleError(message)).toBe(false);
  });
});
