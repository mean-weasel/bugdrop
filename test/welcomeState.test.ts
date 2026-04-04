// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';

const BUGDROP_WELCOMED_PREFIX = 'bugdrop_welcomed_';

function hasSeenWelcome(repo: string): boolean {
  try {
    return localStorage.getItem(BUGDROP_WELCOMED_PREFIX + repo) !== null;
  } catch {
    return false;
  }
}

function markWelcomeSeen(repo: string): void {
  try {
    localStorage.setItem(BUGDROP_WELCOMED_PREFIX + repo, Date.now().toString());
  } catch {
    // localStorage may be blocked
  }
}

describe('Welcome state persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false when welcome has not been seen', () => {
    expect(hasSeenWelcome('owner/repo')).toBe(false);
  });

  it('returns true after marking welcome as seen', () => {
    markWelcomeSeen('owner/repo');
    expect(hasSeenWelcome('owner/repo')).toBe(true);
  });

  it('scopes welcome state per repo', () => {
    markWelcomeSeen('owner/repo-a');
    expect(hasSeenWelcome('owner/repo-a')).toBe(true);
    expect(hasSeenWelcome('owner/repo-b')).toBe(false);
  });

  it('stores a numeric timestamp', () => {
    markWelcomeSeen('owner/repo');
    const stored = localStorage.getItem(BUGDROP_WELCOMED_PREFIX + 'owner/repo');
    expect(stored).not.toBeNull();
    expect(Number(stored)).toBeGreaterThan(0);
  });
});
