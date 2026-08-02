import { sanitizeCssColor } from '../sanitize';
import { attachSystemThemeListener, resolveTheme } from '../theme';
import type { VariantConfig } from './public-types';

interface StyledVariantRoot {
  readonly root: HTMLDivElement;
  dispose(): void;
}

export function createStyledVariantRoot(
  shadow: ShadowRoot,
  config: Readonly<VariantConfig>,
  presentation: 'inline' | 'modal'
): StyledVariantRoot {
  const style = document.createElement('style');
  style.textContent = VARIANT_CSS;
  shadow.appendChild(style);

  const root = document.createElement('div');
  root.className = 'bdv-root';
  root.dataset.presentation = presentation;
  if (config.presentation.kind === 'modal') {
    root.dataset.size = config.presentation.size ?? 'default';
  }
  root.dataset.density = config.appearance?.density ?? 'comfortable';
  root.dataset.columns = String(config.presentation.columns ?? 1);
  const accent = sanitizeCssColor(config.appearance?.accentColor);
  if (accent) root.style.setProperty('--bdv-accent', accent);
  shadow.appendChild(root);

  const mode = config.appearance?.theme ?? 'auto';
  const applyTheme = (resolved: 'light' | 'dark') => {
    root.classList.toggle('bdv-dark', resolved === 'dark');
  };
  applyTheme(resolveTheme(mode));
  const detachTheme = mode === 'auto' ? attachSystemThemeListener(applyTheme) : () => {};

  return {
    root,
    dispose() {
      detachTheme();
      style.remove();
      root.remove();
    },
  };
}

const VARIANT_CSS = `
  :host {
    --bdv-accent: #2563eb;
    display: block;
    color-scheme: light;
  }

  *, *::before, *::after { box-sizing: border-box; }

  .bdv-root {
    --bdv-bg: #ffffff;
    --bdv-bg-muted: #f8fafc;
    --bdv-text: #0f172a;
    --bdv-text-muted: #64748b;
    --bdv-border: #cbd5e1;
    --bdv-danger: #b91c1c;
    --bdv-success: #047857;
    color: var(--bdv-text);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 16px;
    line-height: 1.5;
  }

  .bdv-root.bdv-dark {
    --bdv-bg: #0f172a;
    --bdv-bg-muted: #1e293b;
    --bdv-text: #f8fafc;
    --bdv-text-muted: #94a3b8;
    --bdv-border: #475569;
    --bdv-danger: #fca5a5;
    --bdv-success: #6ee7b7;
    color-scheme: dark;
  }

  .bdv-surface {
    position: relative;
    width: 100%;
    border: 1px solid var(--bdv-border);
    border-radius: 14px;
    background: var(--bdv-bg);
    color: var(--bdv-text);
    padding: 24px;
    box-shadow: 0 8px 28px rgb(15 23 42 / 10%);
  }

  .bdv-root[data-density="compact"] .bdv-surface { padding: 16px; }
  .bdv-header { margin-bottom: 20px; }
  .bdv-title { margin: 0; font-size: 1.25rem; line-height: 1.3; }
  .bdv-description { margin: 8px 0 0; color: var(--bdv-text-muted); }

  .bdv-fields {
    display: grid;
    grid-template-columns: repeat(var(--bdv-columns, 1), minmax(0, 1fr));
    gap: 18px;
  }
  .bdv-root[data-columns="2"] .bdv-fields { --bdv-columns: 2; }
  .bdv-field[data-span="2"] { grid-column: span 2; }
  .bdv-field { min-width: 0; }
  .bdv-label { display: block; margin-bottom: 6px; font-weight: 650; }
  .bdv-required { color: var(--bdv-danger); }
  .bdv-help { margin: -2px 0 7px; color: var(--bdv-text-muted); font-size: 0.875rem; }
  .bdv-error { margin-top: 6px; color: var(--bdv-danger); font-size: 0.875rem; }

  .bdv-input {
    width: 100%;
    min-height: 44px;
    border: 1px solid var(--bdv-border);
    border-radius: 9px;
    background: var(--bdv-bg);
    color: var(--bdv-text);
    padding: 10px 12px;
    font: inherit;
  }
  textarea.bdv-input { min-height: 108px; resize: vertical; }
  .bdv-input:focus-visible,
  .bdv-rating-option:focus-visible,
  .bdv-submit:focus-visible,
  .bdv-cancel:focus-visible,
  .bdv-close:focus-visible,
  .bdv-success-link:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--bdv-accent) 35%, transparent);
    outline-offset: 2px;
  }
  [aria-invalid="true"] { border-color: var(--bdv-danger); }

  .bdv-rating { display: flex; flex-wrap: wrap; gap: 6px; }
  .bdv-rating-option {
    width: 44px;
    height: 44px;
    border: 1px solid var(--bdv-border);
    border-radius: 9px;
    background: var(--bdv-bg-muted);
    color: var(--bdv-text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 1.4rem;
    line-height: 1;
  }
  .bdv-rating-option:hover,
  .bdv-rating-option--active { color: var(--bdv-accent); border-color: var(--bdv-accent); }
  .bdv-rating-option:disabled { cursor: wait; opacity: 0.65; }
  .bdv-rating-labels {
    display: flex;
    justify-content: space-between;
    margin-top: 5px;
    color: var(--bdv-text-muted);
    font-size: 0.8rem;
  }

  .bdv-actions { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
  .bdv-submit {
    min-height: 44px;
    border: 0;
    border-radius: 9px;
    background: var(--bdv-accent);
    color: #ffffff;
    cursor: pointer;
    padding: 10px 18px;
    font: inherit;
    font-weight: 700;
  }
  .bdv-cancel {
    min-height: 44px;
    border: 1px solid var(--bdv-border);
    border-radius: 9px;
    background: var(--bdv-bg);
    color: var(--bdv-text);
    cursor: pointer;
    padding: 10px 18px;
    font: inherit;
    font-weight: 650;
  }
  .bdv-cancel:disabled { cursor: wait; opacity: 0.65; }
  .bdv-overlay {
    display: grid;
    min-height: 100%;
    place-items: center;
    overflow: auto;
    padding: max(20px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(20px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    background: rgb(15 23 42 / 56%);
  }
  .bdv-root[data-presentation="modal"] { height: 100%; }
  .bdv-root[data-presentation="modal"] .bdv-surface { max-width: 560px; }
  .bdv-root[data-size="compact"] .bdv-surface { max-width: 440px; }
  .bdv-root[data-size="wide"] .bdv-surface { max-width: 760px; }
  .bdv-close {
    position: absolute;
    top: 10px;
    right: 10px;
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--bdv-text-muted);
    cursor: pointer;
    font: inherit;
    font-size: 1.6rem;
    line-height: 1;
  }
  .bdv-close:hover { background: var(--bdv-bg-muted); color: var(--bdv-text); }
  .bdv-root[data-presentation="modal"] .bdv-header { padding-right: 36px; }
  .bdv-submit:disabled { cursor: wait; opacity: 0.65; }
  .bdv-status { min-height: 1.5em; margin: 12px 0 0; color: var(--bdv-text-muted); }
  .bdv-status[data-kind="error"] { color: var(--bdv-danger); }
  .bdv-success { outline: none; }
  .bdv-success-title { margin: 0; color: var(--bdv-success); font-size: 1.2rem; }
  .bdv-success-message { margin: 8px 0 0; color: var(--bdv-text-muted); }
  .bdv-success-link { display: inline-block; margin-top: 14px; color: var(--bdv-accent); }

  @media (max-width: 640px) {
    .bdv-root[data-columns="2"] .bdv-fields { --bdv-columns: 1; }
    .bdv-field[data-span="2"] { grid-column: span 1; }
    .bdv-surface { padding: 18px; }
    .bdv-root[data-presentation="modal"] .bdv-surface { max-width: none; }
  }
`;
