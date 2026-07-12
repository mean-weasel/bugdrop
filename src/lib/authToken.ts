import { timingSafeEqual } from './timingSafeEqual';

interface BugDropAuthTokenPayload {
  iss?: string;
  aud?: string;
  sub: string;
  repo: string;
  origin?: string;
  iat: number;
  nbf?: number;
  exp: number;
  jti: string;
}

interface VerifyBugDropAuthTokenOptions {
  secret: string;
  repo: string;
  audience?: string;
  issuer?: string;
  now?: number;
}

const TOKEN_PREFIX = 'bd1';
const CLOCK_SKEW_SECONDS = 30;

export async function verifyBugDropAuthToken(
  token: string | undefined,
  options: VerifyBugDropAuthTokenOptions
): Promise<BugDropAuthTokenPayload> {
  if (!token) throw new Error('Missing BugDrop auth token');

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) {
    throw new Error('Invalid BugDrop auth token format');
  }

  const signedValue = `${parts[0]}.${parts[1]}`;
  const expectedSignature = await signBase64Url(signedValue, options.secret);
  if (!timingSafeEqual(parts[2] ?? '', expectedSignature)) {
    throw new Error('Invalid token signature');
  }

  const payload = parsePayload(parts[1] ?? '');
  const now = options.now ?? Math.floor(Date.now() / 1000);

  if (payload.nbf !== undefined && payload.nbf > now + CLOCK_SKEW_SECONDS) {
    throw new Error('Token not active yet');
  }
  if (payload.exp < now - CLOCK_SKEW_SECONDS) {
    throw new Error('Token expired');
  }
  if (payload.repo !== options.repo) {
    throw new Error('Token repo does not match request repo');
  }
  if (options.audience && payload.aud !== options.audience) {
    throw new Error('Token audience does not match worker');
  }
  if (options.issuer && payload.iss !== options.issuer) {
    throw new Error('Token issuer does not match configuration');
  }

  return payload;
}

export async function createBugDropAuthTokenForTest(
  payload: BugDropAuthTokenPayload,
  secret: string
): Promise<string> {
  const encodedPayload = base64UrlEncodeString(JSON.stringify(payload));
  const signedValue = `${TOKEN_PREFIX}.${encodedPayload}`;
  const signature = await signBase64Url(signedValue, secret);
  return `${signedValue}.${signature}`;
}

async function signBase64Url(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function parsePayload(encoded: string): BugDropAuthTokenPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecodeToString(encoded));
  } catch {
    throw new Error('Invalid token payload');
  }

  if (!isPayload(parsed)) throw new Error('Invalid token payload');
  return parsed;
}

function isPayload(value: unknown): value is BugDropAuthTokenPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.sub === 'string' &&
    typeof payload.repo === 'string' &&
    typeof payload.iat === 'number' &&
    typeof payload.exp === 'number' &&
    typeof payload.jti === 'string' &&
    (payload.iss === undefined || typeof payload.iss === 'string') &&
    (payload.aud === undefined || typeof payload.aud === 'string') &&
    (payload.origin === undefined || typeof payload.origin === 'string') &&
    (payload.nbf === undefined || typeof payload.nbf === 'number')
  );
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToString(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}
