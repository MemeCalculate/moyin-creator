/**
 * Type-safe merge utility for Zustand persist middleware.
 *
 * Validates that `persisted` is a non-null object and only copies keys
 * that are explicitly listed in `keys`, preventing unknown properties
 * from leaking into the store when the persisted schema changes.
 */
export function safeMerge<T extends Record<string, unknown>>(
  persisted: unknown,
  current: T,
  keys: readonly (keyof T)[],
): T {
  if (!isPlainObject(persisted)) return current;

  const result = { ...current };
  for (const key of keys) {
    if (key in persisted) {
      result[key] = (persisted as T)[key];
    }
  }
  return result;
}

/**
 * Type guard: returns true when `value` is a non-null, non-array plain object.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely extract a typed property from an unknown persisted object.
 * Returns `fallback` when the property is missing or `persisted` is not an object.
 */
export function persistedProp<T>(
  persisted: unknown,
  key: string,
  fallback: T,
): T {
  if (!isPlainObject(persisted)) return fallback;
  return key in persisted ? (persisted[key] as T) : fallback;
}
