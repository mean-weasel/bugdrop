// @vitest-environment jsdom
// test/theme.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  applyCustomStyles,
  applyThemeClass,
  attachSystemThemeListener,
  getSystemTheme,
  isValidTheme,
  resolveTheme,
} from '../src/widget/theme';

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

describe('applyThemeClass', () => {
  it('adds bd-dark when resolved is dark', () => {
    const root = document.createElement('div');
    root.className = 'bd-root';
    applyThemeClass(root, 'dark');
    expect(root.classList.contains('bd-dark')).toBe(true);
    expect(root.classList.contains('bd-root')).toBe(true);
  });

  it('removes bd-dark when resolved is light', () => {
    const root = document.createElement('div');
    root.className = 'bd-root bd-dark';
    applyThemeClass(root, 'light');
    expect(root.classList.contains('bd-dark')).toBe(false);
    expect(root.classList.contains('bd-root')).toBe(true);
  });

  it('is idempotent (dark twice)', () => {
    const root = document.createElement('div');
    root.className = 'bd-root';
    applyThemeClass(root, 'dark');
    applyThemeClass(root, 'dark');
    expect(root.classList.contains('bd-dark')).toBe(true);
  });

  it('is idempotent (light twice)', () => {
    const root = document.createElement('div');
    root.className = 'bd-root';
    applyThemeClass(root, 'light');
    applyThemeClass(root, 'light');
    expect(root.classList.contains('bd-dark')).toBe(false);
  });
});

describe('applyCustomStyles', () => {
  function makeRoot(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'bd-root';
    return root;
  }

  it('no-ops when config is empty', () => {
    const root = makeRoot();
    applyCustomStyles(root, {}, 'light');
    expect(root.getAttribute('style')).toBeFalsy();
  });

  describe('accentColor', () => {
    it('sets --bd-primary, --bd-primary-hover, --bd-border-focus', () => {
      const root = makeRoot();
      applyCustomStyles(root, { accentColor: '#ff6b35' }, 'light');
      expect(root.style.getPropertyValue('--bd-primary')).toBe('#ff6b35');
      expect(root.style.getPropertyValue('--bd-primary-hover')).toBe(
        'color-mix(in srgb, #ff6b35 85%, black)'
      );
      expect(root.style.getPropertyValue('--bd-border-focus')).toBe('#ff6b35');
    });

    it('is independent of theme', () => {
      const rootLight = makeRoot();
      const rootDark = makeRoot();
      applyCustomStyles(rootLight, { accentColor: '#ff6b35' }, 'light');
      applyCustomStyles(rootDark, { accentColor: '#ff6b35' }, 'dark');
      expect(rootLight.style.getPropertyValue('--bd-primary-hover')).toBe(
        rootDark.style.getPropertyValue('--bd-primary-hover')
      );
    });
  });

  describe('bgColor', () => {
    it('light mode derives secondary/tertiary by mixing with black', () => {
      const root = makeRoot();
      applyCustomStyles(root, { bgColor: '#fffef0' }, 'light');
      expect(root.style.getPropertyValue('--bd-bg-primary')).toBe('#fffef0');
      expect(root.style.getPropertyValue('--bd-bg-secondary')).toBe(
        'color-mix(in srgb, #fffef0 93%, black)'
      );
      expect(root.style.getPropertyValue('--bd-bg-tertiary')).toBe(
        'color-mix(in srgb, #fffef0 85%, black)'
      );
    });

    it('dark mode derives secondary/tertiary by mixing with white', () => {
      const root = makeRoot();
      applyCustomStyles(root, { bgColor: '#0a0a0a' }, 'dark');
      expect(root.style.getPropertyValue('--bd-bg-primary')).toBe('#0a0a0a');
      expect(root.style.getPropertyValue('--bd-bg-secondary')).toBe(
        'color-mix(in srgb, #0a0a0a 85%, white)'
      );
      expect(root.style.getPropertyValue('--bd-bg-tertiary')).toBe(
        'color-mix(in srgb, #0a0a0a 70%, white)'
      );
    });

    it('re-running with different theme overwrites secondary/tertiary', () => {
      const root = makeRoot();
      applyCustomStyles(root, { bgColor: '#fffef0' }, 'light');
      const lightSecondary = root.style.getPropertyValue('--bd-bg-secondary');
      applyCustomStyles(root, { bgColor: '#fffef0' }, 'dark');
      const darkSecondary = root.style.getPropertyValue('--bd-bg-secondary');
      expect(lightSecondary).not.toBe(darkSecondary);
      expect(darkSecondary).toContain('white');
    });
  });

  describe('textColor', () => {
    it('uses bgColor when provided for the bgBase fallback', () => {
      const root = makeRoot();
      applyCustomStyles(root, { textColor: '#1a1a1a', bgColor: '#fffef0' }, 'light');
      expect(root.style.getPropertyValue('--bd-text-secondary')).toBe(
        'color-mix(in srgb, #1a1a1a 65%, #fffef0)'
      );
    });

    it('falls back to theme default in light mode when no bgColor', () => {
      const root = makeRoot();
      applyCustomStyles(root, { textColor: '#1a1a1a' }, 'light');
      expect(root.style.getPropertyValue('--bd-text-secondary')).toBe(
        'color-mix(in srgb, #1a1a1a 65%, #fafaf9)'
      );
    });

    it('falls back to theme default in dark mode when no bgColor', () => {
      const root = makeRoot();
      applyCustomStyles(root, { textColor: '#f1f5f9' }, 'dark');
      expect(root.style.getPropertyValue('--bd-text-secondary')).toBe(
        'color-mix(in srgb, #f1f5f9 65%, #0f172a)'
      );
    });
  });

  describe('border', () => {
    it('sets --bd-border and --bd-border-style when borderWidth is provided', () => {
      const root = makeRoot();
      applyCustomStyles(root, { borderWidth: '4' }, 'light');
      expect(root.style.getPropertyValue('--bd-border-style')).toBe('4px solid var(--bd-border)');
    });

    it('uses explicit borderColor when provided', () => {
      const root = makeRoot();
      applyCustomStyles(root, { borderWidth: '2', borderColor: '#000' }, 'light');
      expect(root.style.getPropertyValue('--bd-border')).toBe('#000');
      expect(root.style.getPropertyValue('--bd-border-style')).toBe('2px solid #000');
    });
  });

  describe('shadow', () => {
    it('shadow: none sets all shadow vars to none', () => {
      const root = makeRoot();
      applyCustomStyles(root, { shadow: 'none' }, 'light');
      expect(root.style.getPropertyValue('--bd-shadow-sm')).toBe('none');
      expect(root.style.getPropertyValue('--bd-shadow-md')).toBe('none');
      expect(root.style.getPropertyValue('--bd-shadow-lg')).toBe('none');
      expect(root.style.getPropertyValue('--bd-shadow-glow')).toBe('none');
    });

    it('shadow: hard in light mode uses #1a1a1a fallback for shadowColor', () => {
      const root = makeRoot();
      applyCustomStyles(root, { shadow: 'hard' }, 'light');
      expect(root.style.getPropertyValue('--bd-shadow-sm')).toContain('#1a1a1a');
    });

    it('shadow: hard in dark mode uses #000 fallback for shadowColor', () => {
      const root = makeRoot();
      applyCustomStyles(root, { shadow: 'hard' }, 'dark');
      expect(root.style.getPropertyValue('--bd-shadow-sm')).toContain('#000');
    });
  });
});

describe('attachSystemThemeListener', () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  function mockMatchMedia() {
    const listeners = new Set<(e: MediaQueryListEvent) => void>();
    const mql = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn((_type: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      }),
      removeEventListener: vi.fn((_type: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    };
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
    return {
      fire(matches: boolean) {
        listeners.forEach(cb =>
          cb({ matches, media: '(prefers-color-scheme: dark)' } as MediaQueryListEvent)
        );
      },
      mql,
      listeners,
    };
  }

  it('returns a no-op cleanup when matchMedia is missing', () => {
    // @ts-expect-error deliberately remove
    delete window.matchMedia;
    const cleanup = attachSystemThemeListener(() => {});
    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });

  it('invokes callback with "dark" when the media query starts matching', () => {
    const harness = mockMatchMedia();
    const cb = vi.fn();
    attachSystemThemeListener(cb);
    harness.fire(true);
    expect(cb).toHaveBeenCalledWith('dark');
  });

  it('invokes callback with "light" when the media query stops matching', () => {
    const harness = mockMatchMedia();
    const cb = vi.fn();
    attachSystemThemeListener(cb);
    harness.fire(false);
    expect(cb).toHaveBeenCalledWith('light');
  });

  it('stops invoking the callback after cleanup()', () => {
    const harness = mockMatchMedia();
    const cb = vi.fn();
    const cleanup = attachSystemThemeListener(cb);
    cleanup();
    harness.fire(true);
    expect(cb).not.toHaveBeenCalled();
  });
});
