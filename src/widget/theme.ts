// src/widget/theme.ts
// Stubs for Task 1 of the runtime theme API plan. Real implementations land
// in Tasks 2-7 and will consume every parameter. Until then we silence the
// no-unused-vars rule file-wide so the signatures can match the plan text.
/* eslint-disable @typescript-eslint/no-unused-vars */

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
  const borderW = config.borderWidth ? parseInt(config.borderWidth, 10) : null;
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
  throw new Error('not implemented');
}
