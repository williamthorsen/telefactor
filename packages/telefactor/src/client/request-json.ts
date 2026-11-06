import type { z } from 'zod';

import { buildRequestError, TelefactorRequestError } from './telefactor-request-error.ts';

/** Sends a request and parses its JSON body with the schema; throws `TelefactorRequestError` for a refused response. */
export async function requestJson<T>(
  fetchFunction: typeof fetch,
  schema: z.ZodType<T>,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetchFunction(url, init);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // A `basePath` that the plugin does not serve reaches Vite's HTML fallback.
    throw new TelefactorRequestError(response.status, `The response from ${url} is not JSON.`);
  }
  if (!response.ok) throw buildRequestError(response.status, body);
  return schema.parse(body);
}
