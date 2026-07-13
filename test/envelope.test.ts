import { describe, expect, it } from 'vitest';
import { isEnvelope, unwrapSecret, wrapSecret } from '../src/lib/envelope';

// 32 zero bytes, base64 — deterministic test KEK, never a real one.
const KEK = Buffer.alloc(32, 0).toString('base64');
const OTHER_KEK = Buffer.alloc(32, 7).toString('base64');

describe('secret envelope (D5/M2-01)', () => {
  it('round-trips a secret through wrap/unwrap', async () => {
    const envelope = await wrapSecret('super-secret-value', KEK);
    expect(isEnvelope(envelope)).toBe(true);
    expect(envelope.startsWith('v1.')).toBe(true);
    expect(envelope).not.toContain('super-secret-value');
    expect(await unwrapSecret(envelope, KEK)).toBe('super-secret-value');
  });

  it('produces a distinct envelope per wrap (random IV)', async () => {
    const a = await wrapSecret('same-plaintext-here', KEK);
    const b = await wrapSecret('same-plaintext-here', KEK);
    expect(a).not.toBe(b);
  });

  it('accepts a base64url KEK too', async () => {
    const urlSafe = KEK.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const envelope = await wrapSecret('secret', urlSafe);
    expect(await unwrapSecret(envelope, KEK)).toBe('secret');
  });

  it('fails loud when the KEK is missing', async () => {
    await expect(wrapSecret('secret', undefined)).rejects.toThrow('BUGDROP_KEK is not configured');
    await expect(unwrapSecret('v1.aaaa.bbbb', undefined)).rejects.toThrow(
      'BUGDROP_KEK is not configured'
    );
  });

  it('fails loud when the KEK has the wrong length', async () => {
    const short = Buffer.alloc(16, 0).toString('base64');
    await expect(wrapSecret('secret', short)).rejects.toThrow('must decode to 32 bytes');
  });

  it('rejects a malformed envelope', async () => {
    await expect(unwrapSecret('not-an-envelope', KEK)).rejects.toThrow('Malformed secret envelope');
    await expect(unwrapSecret('v2.aaaa.bbbb', KEK)).rejects.toThrow('Malformed secret envelope');
  });

  it('rejects an envelope wrapped with a different KEK', async () => {
    const envelope = await wrapSecret('secret', KEK);
    await expect(unwrapSecret(envelope, OTHER_KEK)).rejects.toThrow();
  });

  it('isEnvelope matches only the v1 shape', () => {
    expect(isEnvelope('v1.abc-_123.def-_456')).toBe(true);
    expect(isEnvelope('v1.only-one-part')).toBe(false);
    expect(isEnvelope('plaintext')).toBe(false);
    expect(isEnvelope('v1.has.three.parts')).toBe(false);
  });
});
