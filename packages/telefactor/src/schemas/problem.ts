import { z } from 'zod';

/** A problem with an input, located by a dotted path into it; the path is empty for the input as a whole. */
export const problemSchema = z.object({ path: z.string(), message: z.string() });

export type Problem = z.infer<typeof problemSchema>;

/** Formats a zod issue path as a dotted path, such as `harnesses.codex.command.0`. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.map(String).join('.');
}
