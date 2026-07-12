// Field-level validators for TenantConfig v1 sub-objects (theme/behavior/rate).
// Split out of tenants.ts to respect the repo's 300-line-per-file ESLint limit.
// Schema is FROZEN by contract docs/plans/multi-tenant-embed.md (card M0-01).

import type { TenantBehaviorConfig, TenantRateConfig, TenantThemeConfig } from './tenantTypes';

const SHADOW_VALUES = new Set(['none', 'soft', 'hard']);
const POSITION_VALUES = new Set(['bottom-right', 'bottom-left']);
const THEME_MODE_VALUES = new Set(['light', 'dark', 'auto']);
const SCREENSHOT_VALUES = new Set(['optional', 'auto', 'required']);
const WELCOME_VALUES = new Set(['once', 'always', 'never']);
const SHOW_ISSUE_LINK_VALUES = new Set(['public', 'always', 'never']);

export const THEME_FIELDS = new Set([
  'color',
  'bg',
  'text',
  'font',
  'radius',
  'borderWidth',
  'borderColor',
  'shadow',
  'icon',
  'label',
  'position',
  'mode',
]);

export const BEHAVIOR_FIELDS = new Set([
  'locale',
  'showName',
  'requireName',
  'showEmail',
  'requireEmail',
  'screenshot',
  'welcome',
  'showIssueLink',
  'sendConsoleLogs',
  'buttonDismissible',
  'dismissDuration',
  'showRestore',
  'categoryLabels',
]);

export const RATE_FIELDS = new Set(['perIp', 'perRepo']);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function checkUnknownFields(
  obj: Record<string, unknown>,
  allowed: Set<string>,
  pathPrefix: string,
  errors: string[]
): void {
  for (const field of Object.keys(obj)) {
    if (!allowed.has(field)) {
      errors.push(`Unknown field "${pathPrefix}${field}"`);
    }
  }
}

export function isValidOrigin(value: string): boolean {
  if (value.includes('*')) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // No paths, no query, no hash, no trailing slash beyond the origin itself.
  if (url.pathname !== '/' && url.pathname !== '') return false;
  if (url.search !== '' || url.hash !== '') return false;
  if (`${url.protocol}//${url.host}` !== value) return false;

  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:' && url.hostname === 'localhost') return true;
  return false;
}

export function validateTheme(input: unknown, errors: string[]): TenantThemeConfig | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    errors.push('theme must be an object');
    return undefined;
  }
  checkUnknownFields(input, THEME_FIELDS, 'theme.', errors);

  const theme: TenantThemeConfig = {};
  const stringFields: Array<keyof TenantThemeConfig> = [
    'color',
    'bg',
    'text',
    'font',
    'radius',
    'borderWidth',
    'borderColor',
    'icon',
    'label',
  ];
  for (const field of stringFields) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      errors.push(`theme.${field} must be a string`);
      continue;
    }
    (theme[field] as string) = value;
  }

  if (input.shadow !== undefined) {
    if (typeof input.shadow !== 'string' || !SHADOW_VALUES.has(input.shadow)) {
      errors.push('theme.shadow must be one of "none", "soft", "hard"');
    } else {
      theme.shadow = input.shadow as TenantThemeConfig['shadow'];
    }
  }

  if (input.position !== undefined) {
    if (typeof input.position !== 'string' || !POSITION_VALUES.has(input.position)) {
      errors.push('theme.position must be one of "bottom-right", "bottom-left"');
    } else {
      theme.position = input.position as TenantThemeConfig['position'];
    }
  }

  if (input.mode !== undefined) {
    if (typeof input.mode !== 'string' || !THEME_MODE_VALUES.has(input.mode)) {
      errors.push('theme.mode must be one of "light", "dark", "auto"');
    } else {
      theme.mode = input.mode as TenantThemeConfig['mode'];
    }
  }

  return theme;
}

function validateCategoryLabels(
  input: unknown,
  errors: string[]
): Record<string, string | string[]> | undefined {
  if (!isPlainObject(input)) {
    errors.push('behavior.categoryLabels must be an object');
    return undefined;
  }
  const result: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
      result[key] = value as string[];
    } else {
      errors.push(`behavior.categoryLabels.${key} must be a string or array of strings`);
    }
  }
  return result;
}

export function validateBehavior(
  input: unknown,
  errors: string[]
): TenantBehaviorConfig | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    errors.push('behavior must be an object');
    return undefined;
  }
  checkUnknownFields(input, BEHAVIOR_FIELDS, 'behavior.', errors);

  const behavior: TenantBehaviorConfig = {};

  if (input.locale !== undefined) {
    if (typeof input.locale !== 'string') {
      errors.push('behavior.locale must be a string');
    } else {
      behavior.locale = input.locale;
    }
  }

  const boolFields: Array<keyof TenantBehaviorConfig> = [
    'showName',
    'requireName',
    'showEmail',
    'requireEmail',
    'sendConsoleLogs',
    'buttonDismissible',
    'showRestore',
  ];
  for (const field of boolFields) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') {
      errors.push(`behavior.${field} must be a boolean`);
      continue;
    }
    (behavior[field] as boolean) = value;
  }

  if (input.screenshot !== undefined) {
    if (typeof input.screenshot !== 'string' || !SCREENSHOT_VALUES.has(input.screenshot)) {
      errors.push('behavior.screenshot must be one of "optional", "auto", "required"');
    } else {
      behavior.screenshot = input.screenshot as TenantBehaviorConfig['screenshot'];
    }
  }

  if (input.welcome !== undefined) {
    if (typeof input.welcome !== 'string' || !WELCOME_VALUES.has(input.welcome)) {
      errors.push('behavior.welcome must be one of "once", "always", "never"');
    } else {
      behavior.welcome = input.welcome as TenantBehaviorConfig['welcome'];
    }
  }

  if (input.showIssueLink !== undefined) {
    if (
      typeof input.showIssueLink !== 'string' ||
      !SHOW_ISSUE_LINK_VALUES.has(input.showIssueLink)
    ) {
      errors.push('behavior.showIssueLink must be one of "public", "always", "never"');
    } else {
      behavior.showIssueLink = input.showIssueLink as TenantBehaviorConfig['showIssueLink'];
    }
  }

  if (input.dismissDuration !== undefined) {
    if (
      typeof input.dismissDuration !== 'number' ||
      !Number.isFinite(input.dismissDuration) ||
      input.dismissDuration <= 0
    ) {
      errors.push('behavior.dismissDuration must be a positive number');
    } else {
      behavior.dismissDuration = input.dismissDuration;
    }
  }

  if (input.categoryLabels !== undefined) {
    const labels = validateCategoryLabels(input.categoryLabels, errors);
    if (labels) behavior.categoryLabels = labels;
  }

  return behavior;
}

export function validateRate(input: unknown, errors: string[]): TenantRateConfig | undefined {
  if (input === undefined) return undefined;
  if (!isPlainObject(input)) {
    errors.push('rate must be an object');
    return undefined;
  }
  checkUnknownFields(input, RATE_FIELDS, 'rate.', errors);

  const rate: TenantRateConfig = {};
  for (const field of ['perIp', 'perRepo'] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      errors.push(`rate.${field} must be a positive number`);
      continue;
    }
    rate[field] = value;
  }

  return rate;
}
