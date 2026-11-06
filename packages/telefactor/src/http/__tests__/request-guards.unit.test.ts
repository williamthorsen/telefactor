import { describe, expect, it } from 'vitest';

import { isLoopbackRequest, isSameOriginRequest } from '../request-guards.ts';

describe(isLoopbackRequest, () => {
  it.each([
    ['127.0.0.1', 'localhost:5173'],
    ['::1', '[::1]:5173'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['127.0.0.1', 'LOCALHOST'],
  ])('accepts %s with Host %s', (remoteAddress, host) => {
    expect(isLoopbackRequest({ remoteAddress, host })).toBe(true);
  });

  it.each([
    ['a remote address', '192.168.1.5', 'localhost:5173'],
    ['a missing address', undefined, 'localhost:5173'],
    ['a rebinding host', '127.0.0.1', 'attacker.example:5173'],
    ['a missing host', '127.0.0.1', undefined],
    ['a malformed host', '127.0.0.1', 'localhost:5173:1'],
  ])('rejects %s', (_case, remoteAddress, host) => {
    expect(isLoopbackRequest({ remoteAddress, host })).toBe(false);
  });
});

describe(isSameOriginRequest, () => {
  const url = 'http://localhost:5173/api/telefactor/jobs';

  it.each([
    ['Sec-Fetch-Site same-origin', { secFetchSite: 'same-origin', origin: undefined }],
    ['Sec-Fetch-Site none', { secFetchSite: 'none', origin: undefined }],
    ['a matching Origin', { secFetchSite: undefined, origin: 'http://localhost:5173' }],
    ['a request without either header', { secFetchSite: undefined, origin: undefined }],
  ])('accepts %s', (_case, headers) => {
    expect(isSameOriginRequest({ ...headers, url })).toBe(true);
  });

  it.each([
    ['Sec-Fetch-Site cross-site', { secFetchSite: 'cross-site', origin: 'http://localhost:5173' }],
    ['Sec-Fetch-Site same-site', { secFetchSite: 'same-site', origin: undefined }],
    ['another Origin', { secFetchSite: undefined, origin: 'http://localhost:3000' }],
  ])('rejects %s', (_case, headers) => {
    expect(isSameOriginRequest({ ...headers, url })).toBe(false);
  });
});
