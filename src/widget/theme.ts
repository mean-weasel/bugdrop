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
  throw new Error('not implemented');
}

export function isValidTheme(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

export function applyThemeClass(root: HTMLElement, resolved: ResolvedTheme): void {
  throw new Error('not implemented');
}

export function applyCustomStyles(
  root: HTMLElement,
  config: ThemeConfigSlice,
  resolved: ResolvedTheme
): void {
  throw new Error('not implemented');
}

export function attachSystemThemeListener(
  onSystemChange: (resolved: ResolvedTheme) => void
): () => void {
  throw new Error('not implemented');
}
