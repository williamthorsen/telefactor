// Minimal helper for reading JSON without type assertions, which this repo bans. Callers validate the
// result with a zod schema.

/** Parses JSON text to `unknown` rather than `any`, forcing callers to narrow before use. */
export function parseJson(text: string): unknown {
  const value: unknown = JSON.parse(text);
  return value;
}
