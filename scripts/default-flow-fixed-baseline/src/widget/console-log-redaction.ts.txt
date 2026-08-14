const SECRET_KEY_PATTERN = String.raw`(?:"|')?\b(?:password|passwd|pwd|token|api[_-]?key|secret|authorization|auth|cookie)\b(?:"|')?`;
const QUOTED_SECRET_PATTERN = new RegExp(
  String.raw`(${SECRET_KEY_PATTERN}\s*[:=]\s*)(["'])(?!Bearer\b)(?:\\[\s\S]|(?!\2)[^\\])*?\2`,
  'gi'
);
const UNTERMINATED_QUOTED_SECRET_PATTERN = new RegExp(
  String.raw`(${SECRET_KEY_PATTERN}\s*[:=]\s*)(["'])(?!Bearer\b)(?:\\[^\r\n]|(?!\2)[^\\\r\n])*(?=\r?\n|$)`,
  'gi'
);
const STRUCTURED_SECRET_PATTERN = new RegExp(
  String.raw`(${SECRET_KEY_PATTERN}\s*[:=]\s*)(?:\[[^\]\r\n]*\]|\{[^\}\r\n]*\})`,
  'gi'
);
const UNQUOTED_SECRET_PATTERN = new RegExp(
  String.raw`(${SECRET_KEY_PATTERN}\s*[:=]\s*)(?!Bearer\b)[^"',\s}&]+`,
  'gi'
);
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const LONG_SECRET_PATTERN = /\b[A-Za-z0-9+/_=-]{32,}\b/g;

export function redactConsoleLogMessage(value: string): string {
  return value
    .replace(BEARER_PATTERN, 'Bearer [redacted]')
    .replace(STRUCTURED_SECRET_PATTERN, '$1[redacted]')
    .replace(QUOTED_SECRET_PATTERN, '$1$2[redacted]$2')
    .replace(UNTERMINATED_QUOTED_SECRET_PATTERN, '$1$2[redacted]')
    .replace(UNQUOTED_SECRET_PATTERN, '$1[redacted]')
    .replace(LONG_SECRET_PATTERN, '[redacted]');
}
