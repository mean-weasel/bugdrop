// src/widget/theme.ts

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

// Forward-declared so this module doesn't import from ui.ts (avoids cycle).
// The actual WidgetConfig type is defined in index.ts and ui.ts; for the
// custom-styles helper we only need the subset of fields we consume.
export interface ThemeConfigSlice {
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
  borderWidth?: string;
  borderColor?: string;
  shadow?: string;
}

export function getSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function resolveTheme(
  mode: ThemeMode,
  getSystem: () => ResolvedTheme = getSystemTheme
): ResolvedTheme {
  if (mode === 'auto') return getSystem();
  return mode;
}

export function isValidTheme(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

export function applyThemeClass(root: HTMLElement, resolved: ResolvedTheme): void {
  root.classList.toggle('bd-dark', resolved === 'dark');
}

export function applyCustomStyles(
  root: HTMLElement,
  config: ThemeConfigSlice,
  resolved: ResolvedTheme
): void {
  const isDark = resolved === 'dark';

  // Apply custom accent color if provided
  if (config.accentColor) {
    const color = config.accentColor;
    root.style.setProperty('--bd-primary', color);
    root.style.setProperty('--bd-primary-hover', `color-mix(in srgb, ${color} 85%, black)`);
    root.style.setProperty('--bd-border-focus', color);
  }

  // Apply custom background color if provided
  if (config.bgColor) {
    root.style.setProperty('--bd-bg-primary', config.bgColor);
    if (isDark) {
      root.style.setProperty(
        '--bd-bg-secondary',
        `color-mix(in srgb, ${config.bgColor} 85%, white)`
      );
      root.style.setProperty(
        '--bd-bg-tertiary',
        `color-mix(in srgb, ${config.bgColor} 70%, white)`
      );
    } else {
      root.style.setProperty(
        '--bd-bg-secondary',
        `color-mix(in srgb, ${config.bgColor} 93%, black)`
      );
      root.style.setProperty(
        '--bd-bg-tertiary',
        `color-mix(in srgb, ${config.bgColor} 85%, black)`
      );
    }
  }

  // Apply custom text color if provided
  if (config.textColor) {
    root.style.setProperty('--bd-text-primary', config.textColor);
    const bgBase = config.bgColor || (isDark ? '#0f172a' : '#fafaf9');
    root.style.setProperty(
      '--bd-text-secondary',
      `color-mix(in srgb, ${config.textColor} 65%, ${bgBase})`
    );
    root.style.setProperty(
      '--bd-text-muted',
      `color-mix(in srgb, ${config.textColor} 40%, ${bgBase})`
    );
  }

  // Apply custom border styling if provided
  const parsedBorderW = config.borderWidth ? parseInt(config.borderWidth, 10) : null;
  const borderW = parsedBorderW !== null && Number.isFinite(parsedBorderW) ? parsedBorderW : null;
  const borderC = config.borderColor || null;
  if (borderW !== null || borderC !== null) {
    const bw = borderW !== null ? `${borderW}px` : '1px';
    const bc = borderC || 'var(--bd-border)';
    root.style.setProperty('--bd-border', bc);
    root.style.setProperty('--bd-border-style', `${bw} solid ${bc}`);
  }

  // Apply shadow preset if provided
  const shadowPreset = config.shadow || null;
  if (shadowPreset === 'none') {
    root.style.setProperty('--bd-shadow-sm', 'none');
    root.style.setProperty('--bd-shadow-md', 'none');
    root.style.setProperty('--bd-shadow-lg', 'none');
    root.style.setProperty('--bd-shadow-glow', 'none');
  } else if (shadowPreset === 'hard') {
    const shadowColor = borderC || (isDark ? '#000' : '#1a1a1a');
    const offset = borderW !== null ? `${borderW + 2}px` : '6px';
    root.style.setProperty('--bd-shadow-sm', `${shadowColor} 2px 2px 0 0`);
    root.style.setProperty('--bd-shadow-md', `${shadowColor} ${offset} ${offset} 0 0`);
    root.style.setProperty('--bd-shadow-lg', `${shadowColor} ${offset} ${offset} 0 0`);
    root.style.setProperty('--bd-shadow-glow', 'none');
  }
}

export function attachSystemThemeListener(
  onSystemChange: (resolved: ResolvedTheme) => void
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    // Fires in SSR, sandboxed iframes, or environments without matchMedia.
    // data-theme="auto" will still resolve correctly at init but won't react
    // to runtime OS theme changes. Warn so integrators can debug.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[BugDrop] window.matchMedia unavailable; data-theme="auto" will not react to OS theme changes.'
      );
    }
    return () => {
      /* no-op cleanup */
    };
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => {
    try {
      onSystemChange(e.matches ? 'dark' : 'light');
    } catch (err) {
      // A throw inside the callback (e.g. detached DOM root) would otherwise
      // propagate into the browser's event loop. Catch it here so the listener
      // keeps firing on subsequent OS theme changes.
      console.warn('[BugDrop] Error applying system theme change:', err);
    }
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
