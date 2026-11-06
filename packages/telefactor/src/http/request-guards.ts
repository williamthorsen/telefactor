const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// The `Host` check stops a DNS-rebinding page in the user's browser, whose requests arrive from a loopback address.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// `none` marks a request that the user started, such as a URL typed into the address bar.
const SAME_ORIGIN_FETCH_SITES = new Set(['none', 'same-origin']);

/** Reports whether a request comes from a loopback address and names a loopback host. */
export function isLoopbackRequest({
  host,
  remoteAddress,
}: {
  host: string | undefined;
  remoteAddress: string | undefined;
}): boolean {
  if (remoteAddress === undefined || !LOOPBACK_ADDRESSES.has(remoteAddress)) return false;
  const hostname = host?.toLowerCase().match(/^(\[[^\]]*\]|[^:[\]]+)(?::\d+)?$/)?.[1];
  return hostname !== undefined && LOOPBACK_HOSTS.has(hostname);
}

/**
 * Reports whether the browser marks a request as coming from the server's own origin, as Go's
 * `http.CrossOriginProtection` decides it. A request that sends neither `Sec-Fetch-Site` nor `Origin` comes from outside
 * a browser and is accepted.
 */
export function isSameOriginRequest({
  origin,
  secFetchSite,
  url,
}: {
  origin: string | undefined;
  secFetchSite: string | undefined;
  url: string;
}): boolean {
  if (secFetchSite !== undefined) return SAME_ORIGIN_FETCH_SITES.has(secFetchSite.toLowerCase());
  if (origin !== undefined) return origin === new URL(url).origin;
  return true;
}

/** Returns the request's `Host` header, else the `:authority` of an HTTP/2 request, which does not send `Host`. */
export function readRequestHost(hostHeader: string | undefined, incoming: object): string | undefined {
  if (hostHeader !== undefined) return hostHeader;
  return 'authority' in incoming && typeof incoming.authority === 'string' ? incoming.authority : undefined;
}
