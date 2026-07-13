// AES-256-GCM envelope encryption for per-tenant secrets — contract
// docs/plans/multi-tenant-embed.md, decision D5 (card M2-01). Envelope format:
// `v1.<iv_b64url>.<ciphertext_b64url>` (ciphertext includes the GCM tag). The KEK
// comes from the Workers Secret BUGDROP_KEK (base64 or base64url, 32 bytes decoded)
// and is fail-loud by design: a missing or malformed KEK throws instead of silently
// skipping encryption. Plaintext secrets must only ever live in memory — never in
// KV, logs, or responses.

const ENVELOPE_VERSION = 'v1';
const ENVELOPE_PATTERN = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const IV_BYTES = 12;
const KEK_BYTES = 32;

export function isEnvelope(value: string): boolean {
  return ENVELOPE_PATTERN.test(value);
}

export async function wrapSecret(plaintext: string, kekB64: string | undefined): Promise<string> {
  const key = await importKek(kekB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${ENVELOPE_VERSION}.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

export async function unwrapSecret(envelope: string, kekB64: string | undefined): Promise<string> {
  if (!isEnvelope(envelope)) {
    throw new Error('Malformed secret envelope');
  }
  const key = await importKek(kekB64);
  const [, ivB64, ciphertextB64] = envelope.split('.');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(ivB64 ?? '') },
    key,
    base64UrlDecode(ciphertextB64 ?? '')
  );
  return new TextDecoder().decode(plaintext);
}

async function importKek(kekB64: string | undefined): Promise<CryptoKey> {
  if (!kekB64) {
    throw new Error('BUGDROP_KEK is not configured');
  }
  let raw: Uint8Array;
  try {
    raw = base64UrlDecode(kekB64.trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''));
  } catch {
    throw new Error('BUGDROP_KEK is not valid base64');
  }
  if (raw.length !== KEK_BYTES) {
    throw new Error(`BUGDROP_KEK must decode to ${KEK_BYTES} bytes, got ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
