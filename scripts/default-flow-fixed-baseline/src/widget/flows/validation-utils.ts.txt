const ID = /^[a-z][a-z0-9_-]{0,63}$/;

export function only(value: object, keys: Set<string>, label: string): void {
  for (const key of Object.keys(value))
    if (!keys.has(key)) fail(`${label} contains unknown key ${key}`);
}

export function validId(value: unknown, label: string): void {
  if (typeof value !== 'string' || !ID.test(value) || value === 'legacy')
    fail(`${label} is invalid`);
}

export function text(value: unknown, label: string, maximum: number): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maximum ||
    [...value].some(character => {
      const code = character.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    })
  )
    fail(`${label} is invalid`);
}

export function optionalText(value: unknown, label: string, maximum: number): void {
  if (value !== undefined) text(value, label, maximum);
}

export function scalar(value: unknown, label: string): void {
  if (
    (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    fail(`${label} must be scalar`);
}

export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function fail(message: string): never {
  throw new TypeError(`BugDrop flow ${message}`);
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
