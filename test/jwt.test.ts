import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateGitHubAppJWT } from '../src/lib/jwt';

const FIXED_TIME = new Date('2026-08-06T12:34:56.000Z');

let pkcs8PrivateKey: string;
let pkcs1PrivateKey: string;
let publicKey: CryptoKey;

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

function decodeJson(value: string): unknown {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

beforeAll(async () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  pkcs8PrivateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  pkcs1PrivateKey = pair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  const spki = pair.publicKey.export({ type: 'spki', format: 'der' });
  publicKey = await crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
});

describe('generateGitHubAppJWT', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cryptographically verifies RS256 and rejects altered signing input', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME.getTime());
    const token = await generateGitHubAppJWT('123456', pkcs8PrivateKey);
    const [header, payload, signature] = token.split('.');
    const signingInput = `${header}.${payload}`;

    expect(decodeJson(header)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decodeJson(payload)).toEqual({
      iat: Math.floor(FIXED_TIME.getTime() / 1000) - 60,
      exp: Math.floor(FIXED_TIME.getTime() / 1000) + 600,
      iss: '123456',
    });
    await expect(
      crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        publicKey,
        decodeBase64Url(signature),
        new TextEncoder().encode(signingInput)
      )
    ).resolves.toBe(true);
    await expect(
      crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        publicKey,
        decodeBase64Url(signature),
        new TextEncoder().encode(`${header}.${payload.slice(0, -1)}A`)
      )
    ).resolves.toBe(false);
  });

  it('converts PKCS#1 private keys and produces a verifiable signature', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME.getTime());
    const token = await generateGitHubAppJWT('654321', pkcs1PrivateKey);
    const [header, payload, signature] = token.split('.');

    expect(decodeJson(payload)).toMatchObject({ iss: '654321' });
    await expect(
      crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        publicKey,
        decodeBase64Url(signature),
        new TextEncoder().encode(`${header}.${payload}`)
      )
    ).resolves.toBe(true);
  });

  it.each([
    ['malformed PKCS#8', '-----BEGIN PRIVATE KEY-----\nnot-base64!\n-----END PRIVATE KEY-----'],
    [
      'malformed PKCS#1',
      '-----BEGIN RSA PRIVATE KEY-----\nnot-base64!\n-----END RSA PRIVATE KEY-----',
    ],
    ['empty key', ''],
  ])('rejects %s input', async (_name, privateKey) => {
    await expect(generateGitHubAppJWT('123456', privateKey)).rejects.toThrow();
  });
});
