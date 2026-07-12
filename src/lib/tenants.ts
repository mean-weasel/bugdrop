// TenantConfig v1 — FROZEN by contract docs/plans/multi-tenant-embed.md (card M0-01).
// Any field/shape change requires amending that contract before touching this file.

import {
  checkUnknownFields,
  isNonEmptyString,
  isPlainObject,
  isValidOrigin,
  validateBehavior,
  validateRate,
  validateTheme,
} from './tenantFieldValidators';
import type { TenantConfig } from './tenantTypes';

export type {
  TenantBehaviorConfig,
  TenantConfig,
  TenantRateConfig,
  TenantThemeConfig,
} from './tenantTypes';

export type ValidateTenantConfigResult =
  | { ok: true; value: TenantConfig }
  | { ok: false; errors: string[] };

const KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const REPO_PATTERN = /^[^/\s]+\/[^/\s]+$/;
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const STATUS_VALUES = new Set(['active', 'paused']);

const TOP_LEVEL_FIELDS = new Set([
  'version',
  'key',
  'name',
  'repo',
  'origins',
  'status',
  'theme',
  'behavior',
  'rate',
  'authTokenSecretEnc',
  'createdAt',
  'updatedAt',
]);

/**
 * Validates an unknown value against the frozen TenantConfig v1 schema.
 * Rejects unknown fields at every level (fail-loud on typos).
 */
export function validateTenantConfig(input: unknown): ValidateTenantConfigResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ['TenantConfig must be an object'] };
  }

  checkUnknownFields(input, TOP_LEVEL_FIELDS, '', errors);

  if (input.version !== 1) {
    errors.push('version must be 1');
  }

  if (!isNonEmptyString(input.key) || !KEY_PATTERN.test(input.key)) {
    errors.push('key must match ^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$');
  }

  if (!isNonEmptyString(input.name) || input.name.length > 100) {
    errors.push('name must be a non-empty string of at most 100 characters');
  }

  if (!isNonEmptyString(input.repo) || !REPO_PATTERN.test(input.repo)) {
    errors.push('repo must be in "owner/repo" format');
  }

  if (
    !Array.isArray(input.origins) ||
    input.origins.length === 0 ||
    !input.origins.every(origin => typeof origin === 'string')
  ) {
    errors.push('origins must be a non-empty array of strings');
  } else {
    for (const origin of input.origins as string[]) {
      if (!isValidOrigin(origin)) {
        errors.push(
          `origins entry "${origin}" must be an https:// origin (or http://localhost) with no path`
        );
      }
    }
  }

  if (typeof input.status !== 'string' || !STATUS_VALUES.has(input.status)) {
    errors.push('status must be "active" or "paused"');
  }

  const theme = validateTheme(input.theme, errors);
  const behavior = validateBehavior(input.behavior, errors);
  const rate = validateRate(input.rate, errors);

  if (input.authTokenSecretEnc !== undefined && typeof input.authTokenSecretEnc !== 'string') {
    errors.push('authTokenSecretEnc must be a string');
  }

  if (!isNonEmptyString(input.createdAt) || !ISO_8601_PATTERN.test(input.createdAt)) {
    errors.push('createdAt must be an ISO 8601 string');
  }

  if (!isNonEmptyString(input.updatedAt) || !ISO_8601_PATTERN.test(input.updatedAt)) {
    errors.push('updatedAt must be an ISO 8601 string');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const value: TenantConfig = {
    version: 1,
    key: input.key as string,
    name: input.name as string,
    repo: input.repo as string,
    origins: input.origins as string[],
    status: input.status as TenantConfig['status'],
    createdAt: input.createdAt as string,
    updatedAt: input.updatedAt as string,
  };
  if (theme && Object.keys(theme).length > 0) value.theme = theme;
  if (behavior && Object.keys(behavior).length > 0) value.behavior = behavior;
  if (rate && Object.keys(rate).length > 0) value.rate = rate;
  if (typeof input.authTokenSecretEnc === 'string') {
    value.authTokenSecretEnc = input.authTokenSecretEnc;
  }

  return { ok: true, value };
}

/**
 * Maps a validated TenantConfig to the data-attribute map the loader injects
 * into the widget core `<script>` tag (per D1). Booleans/numbers are
 * serialized as strings exactly the way the widget already parses them.
 */
export function tenantToDataAttributes(tenant: TenantConfig): Record<string, string> {
  const attrs: Record<string, string> = {
    repo: tenant.repo,
  };

  const theme = tenant.theme;
  if (theme) {
    if (theme.color !== undefined) attrs.color = theme.color;
    if (theme.bg !== undefined) attrs.bg = theme.bg;
    if (theme.text !== undefined) attrs.text = theme.text;
    if (theme.font !== undefined) attrs.font = theme.font;
    if (theme.radius !== undefined) attrs.radius = theme.radius;
    if (theme.borderWidth !== undefined) attrs['border-width'] = theme.borderWidth;
    if (theme.borderColor !== undefined) attrs['border-color'] = theme.borderColor;
    if (theme.shadow !== undefined) attrs.shadow = theme.shadow;
    if (theme.icon !== undefined) attrs.icon = theme.icon;
    if (theme.label !== undefined) attrs.label = theme.label;
    if (theme.position !== undefined) attrs.position = theme.position;
    if (theme.mode !== undefined) attrs.theme = theme.mode;
  }

  const behavior = tenant.behavior;
  if (behavior) {
    if (behavior.locale !== undefined) attrs.locale = behavior.locale;
    if (behavior.showName !== undefined) attrs['show-name'] = String(behavior.showName);
    if (behavior.requireName !== undefined) attrs['require-name'] = String(behavior.requireName);
    if (behavior.showEmail !== undefined) attrs['show-email'] = String(behavior.showEmail);
    if (behavior.requireEmail !== undefined) {
      attrs['require-email'] = String(behavior.requireEmail);
    }
    if (behavior.screenshot !== undefined) attrs.screenshot = behavior.screenshot;
    if (behavior.welcome !== undefined) attrs.welcome = behavior.welcome;
    if (behavior.showIssueLink !== undefined) {
      attrs['show-issue-link'] = behavior.showIssueLink;
    }
    if (behavior.sendConsoleLogs !== undefined) {
      attrs['send-console-logs'] = String(behavior.sendConsoleLogs);
    }
    if (behavior.buttonDismissible !== undefined) {
      attrs['button-dismissible'] = String(behavior.buttonDismissible);
    }
    if (behavior.dismissDuration !== undefined) {
      attrs['dismiss-duration'] = String(behavior.dismissDuration);
    }
    if (behavior.showRestore !== undefined) attrs['show-restore'] = String(behavior.showRestore);
    if (behavior.categoryLabels !== undefined) {
      attrs['category-labels'] = JSON.stringify(behavior.categoryLabels);
    }
  }

  return attrs;
}
