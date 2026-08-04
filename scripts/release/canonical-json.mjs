import { createHash } from 'node:crypto';

function canonicalError(message) {
  return new TypeError(`Invalid canonical JSON value: ${message}`);
}

export function normalizeCanonicalValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n').normalize('NFC');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw canonicalError('numbers must be finite');
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') throw canonicalError(`${typeof value} is not supported`);
  if (ancestors.has(value)) throw canonicalError('cyclic values are not supported');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => normalizeCanonicalValue(item, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw canonicalError('only plain objects are supported');
    }
    const normalizedEntries = Object.keys(value).map(key => [key.normalize('NFC'), value[key]]);
    if (new Set(normalizedEntries.map(([key]) => key)).size !== normalizedEntries.length) {
      throw canonicalError('object keys collide after Unicode normalization');
    }
    return Object.fromEntries(
      normalizedEntries
        .sort(([left], [right]) => compareUtf8(left, right))
        .map(([key, item]) => [key, normalizeCanonicalValue(item, ancestors)])
    );
  } finally {
    ancestors.delete(value);
  }
}

/** Locale-independent ordering for protocol strings and normalized POSIX paths. */
export function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function canonicalize(value) {
  return JSON.stringify(normalizeCanonicalValue(value));
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalHash(value) {
  return `sha256:${sha256Hex(canonicalize(value))}`;
}
