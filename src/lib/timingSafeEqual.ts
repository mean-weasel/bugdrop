// Shared constant-time string comparison. Extracted from src/lib/authToken.ts so
// other callers needing timing-safe secret comparison (e.g. admin Bearer-token
// auth) reuse the same implementation instead of writing a new one.
export function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const max = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < max; index++) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return diff === 0;
}
