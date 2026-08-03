import { describe, expect, it } from 'vitest';

import {
  canonicalHash,
  canonicalize,
  normalizeCanonicalValue,
} from '../../scripts/release/canonical-json.mjs';

describe('canonical JSON', () => {
  it('sorts object keys recursively without changing array order', () => {
    expect(canonicalize({ z: 1, a: { y: 2, x: [3, 1] } })).toBe('{"a":{"x":[3,1],"y":2},"z":1}');
  });

  it('uses locale-independent Unicode code-unit key ordering', () => {
    expect(canonicalize({ a: 1, Z: 2 })).toBe('{"Z":2,"a":1}');
  });

  it('normalizes text and negative zero', () => {
    const decomposed = 'e\u0301\r\nline';
    expect(normalizeCanonicalValue({ text: decomposed, zero: -0 })).toEqual({
      text: 'é\nline',
      zero: 0,
    });
  });

  it('gives reordered values the same identity and changed content a new one', () => {
    expect(canonicalHash({ b: 2, a: 1 })).toBe(canonicalHash({ a: 1, b: 2 }));
    expect(canonicalHash({ a: 1, b: 2 })).not.toBe(canonicalHash({ a: 1, b: 3 }));
  });

  it.each([
    ['undefined', { value: undefined }],
    ['non-finite number', { value: Number.NaN }],
    ['date object', { value: new Date('2026-01-01T00:00:00Z') }],
  ])('rejects %s rather than silently changing identity', (_name, value) => {
    expect(() => canonicalize(value)).toThrow(/canonical/i);
  });

  it('rejects cyclic values', () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalize(value)).toThrow(/cyclic/i);
  });

  it('rejects object keys that collide after normalization', () => {
    expect(() => canonicalize({ é: 1, ['e\u0301']: 2 })).toThrow(/collide/i);
  });
});
