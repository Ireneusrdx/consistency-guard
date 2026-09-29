/**
 * JSON-in-TEXT helpers.
 *
 * The SQLite connector in this Prisma version does not support the native
 * Json column type, so structured fields are stored as TEXT containing
 * serialized JSON. The schema is designed to be Postgres-compatible: when
 * moving to Postgres these columns can become native Json without code
 * changes beyond these two helpers.
 */

export function jsonStringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function jsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
