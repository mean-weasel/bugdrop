const UNSAFE_CSS_TOKEN_PATTERN = /[;{}<>]|\/\*|\*\/|@import|url\s*\(|<\/style/i;
const CSS_IDENT_PATTERN = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CSS_FUNCTION_COLOR_PATTERN =
  /^(?:rgb|rgba|hsl|hsla)\(\s*[-+.\d%]+\s*(?:,\s*[-+.\d%]+\s*){2,3}\)$/i;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'none') return trimmed;

  try {
    const url = new URL(trimmed, window.location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function sanitizeCssColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || UNSAFE_CSS_TOKEN_PATTERN.test(trimmed)) return undefined;
  if (HEX_COLOR_PATTERN.test(trimmed) || CSS_FUNCTION_COLOR_PATTERN.test(trimmed)) return trimmed;

  if (CSS_IDENT_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (typeof CSS !== 'undefined' && CSS.supports?.('color', trimmed)) {
    return trimmed;
  }

  return undefined;
}

export function sanitizeCssFontFamily(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'inherit') return trimmed;
  if (UNSAFE_CSS_TOKEN_PATTERN.test(trimmed)) return undefined;
  if (!/^[\w\s"',.-]+$/.test(trimmed)) return undefined;
  return trimmed;
}

export function sanitizeNonNegativeNumber(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sanitizeNonNegativePixelValue(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  const match = trimmed?.match(/^((?:0|[1-9]\d*)(?:\.\d+)?)(?:px)?$/);
  if (!match) return undefined;

  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function sanitizePositiveInteger(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[1-9]\d*$/.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function sanitizeShadowPreset(
  value: string | undefined
): 'none' | 'soft' | 'hard' | undefined {
  if (value === 'none' || value === 'soft' || value === 'hard') return value;
  return undefined;
}
