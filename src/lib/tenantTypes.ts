// TenantConfig v1 types — FROZEN by contract docs/plans/multi-tenant-embed.md (card M0-01).
// Split into its own module (no logic) so both tenants.ts and tenantFieldValidators.ts
// can depend on the shapes without forming an import cycle.

export interface TenantThemeConfig {
  color?: string; // -> data-color (sanitizeCssColor rules)
  bg?: string; // -> data-bg
  text?: string; // -> data-text
  font?: string; // -> data-font
  radius?: string; // -> data-radius
  borderWidth?: string; // -> data-border-width
  borderColor?: string; // -> data-border-color
  shadow?: 'none' | 'soft' | 'hard'; // -> data-shadow
  icon?: string; // -> data-icon (URL or "none")
  label?: string; // -> data-label
  position?: 'bottom-right' | 'bottom-left'; // -> data-position
  mode?: 'light' | 'dark' | 'auto'; // -> data-theme
}

export interface TenantBehaviorConfig {
  locale?: string; // -> data-locale
  showName?: boolean; // -> data-show-name
  requireName?: boolean; // -> data-require-name
  showEmail?: boolean; // -> data-show-email
  requireEmail?: boolean; // -> data-require-email
  screenshot?: 'optional' | 'auto' | 'required'; // -> data-screenshot
  welcome?: 'once' | 'always' | 'never'; // -> data-welcome
  showIssueLink?: 'public' | 'always' | 'never'; // -> data-show-issue-link
  sendConsoleLogs?: boolean; // -> data-send-console-logs
  buttonDismissible?: boolean; // -> data-button-dismissible
  dismissDuration?: number; // -> data-dismiss-duration (days)
  showRestore?: boolean; // -> data-show-restore
  categoryLabels?: Record<string, string | string[]>; // -> data-category-labels (JSON)
}

export interface TenantRateConfig {
  perIp?: number; // default 20 (per 15 min window, window fixed in v1)
  perRepo?: number; // default 50 (per 60 min window, window fixed in v1)
}

export interface TenantConfig {
  version: 1;
  key: string; // ^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$
  name: string; // display name, 1..100 chars
  repo: string; // "owner/repo", same validation as data-repo today
  origins: string[]; // exact-match web origins
  status: 'active' | 'paused';
  theme?: TenantThemeConfig;
  behavior?: TenantBehaviorConfig;
  rate?: TenantRateConfig;
  // authTokenSecretEnc intentionally omitted: not supported until M2 envelope
  // encryption lands (D5). validateTenantConfig rejects the field explicitly.
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
