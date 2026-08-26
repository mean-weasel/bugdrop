export const MAX_APP_VERSION_CHARS = 128;

export function parseAppVersion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  if (!normalized || Array.from(normalized).length > MAX_APP_VERSION_CHARS) return undefined;
  if (/[\p{Cf}\p{Zl}\p{Zp}]/u.test(normalized)) return undefined;

  for (const character of normalized) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return undefined;
  }

  return normalized;
}
