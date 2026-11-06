/** Returns an error's message, or the thrown value as a string when it is not an `Error`. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
