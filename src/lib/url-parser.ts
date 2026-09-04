/**
 * Taking a URL apart.
 *
 * The parsing itself is the browser's: `new URL()` implements the WHATWG URL
 * standard, is what the platform will actually do with the string, and is
 * therefore a better answer than anything written here. What this module adds
 * is the reading of it -- the parts, the query parameters with their decoded
 * values, and the observations that are easy to miss and expensive to get
 * wrong: that the port is absent because it is the default, that the host is
 * already punycode, that there is a password in there.
 */

export interface QueryParam {
  /** The key as decoded, which is what the application will read. */
  readonly key: string;
  /** The value as decoded. */
  readonly value: string;
  /** Exactly what was in the URL, for when the two differ. */
  readonly rawKey: string;
  readonly rawValue: string;
}

export interface ParsedUrl {
  readonly href: string;
  readonly protocol: string;
  readonly origin: string;
  readonly username: string;
  readonly password: string;
  /** Hostname plus port, when there is one. */
  readonly host: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly params: ReadonlyArray<QueryParam>;
  /**
   * Things worth saying about this particular URL: defaults that were filled
   * in, encodings that were applied, and the parts that carry risk.
   */
  readonly notes: ReadonlyArray<string>;
}

/** Ports the scheme implies, which is why `port` is usually empty. */
const DEFAULT_PORTS: Readonly<Record<string, string>> = {
  'http:': '80',
  'https:': '443',
  'ftp:': '21',
  'ws:': '80',
  'wss:': '443',
};

/**
 * The query string, split rather than parsed.
 *
 * URLSearchParams hands back decoded values only, which loses the distinction
 * this page exists to show: `a b` and `a%20b` are the same once decoded and
 * are not the same in a URL. So the string is split on the separators by hand
 * and each side is decoded separately, with the original kept beside it.
 */
function queryParams(search: string): QueryParam[] {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (query === '') return [];

  const params: QueryParam[] = [];
  for (const pair of query.split('&')) {
    if (pair === '') continue;
    const separator = pair.indexOf('=');
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? '' : pair.slice(separator + 1);
    params.push({ key: decodeUrlencoded(rawKey), value: decodeUrlencoded(rawValue), rawKey, rawValue });
  }
  return params;
}

/**
 * Decode a query component the way a form would have encoded it.
 *
 * The urlencoded serializer turns a space into +, so + has to become a space
 * on the way back; everything else is percent-decoding. A sequence that is not
 * valid UTF-8 is left alone rather than turned into an error, because a URL
 * carrying bytes that are not text is unusual but legal.
 */
function decodeUrlencoded(text: string): string {
  const spaced = text.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

/**
 * Parse a URL, or throw something worth showing.
 *
 * The common failure is a missing scheme: "example.com/path" is a relative
 * reference, not a URL, and the standard parser is right to refuse it. Saying
 * that is more useful than repeating "Invalid URL".
 */
export function parseUrl(input: string): ParsedUrl {
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new Error('Paste a URL to take it apart.');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    const looksBare = /^[^\s:/?#]+(\.|\/)/.test(trimmed) && !trimmed.includes(':');
    throw new Error(
      looksBare
        ? `"${trimmed}" has no scheme, so it is a relative reference rather than a URL. Prefix it with https:// to parse it.`
        : `"${trimmed}" is not a URL the browser's parser accepts.`,
    );
  }

  const params = queryParams(url.search);

  const notes: string[] = [];
  const defaultPort = DEFAULT_PORTS[url.protocol];
  if (url.port === '' && defaultPort !== undefined) {
    notes.push(
      `No port is shown because ${url.protocol}// uses ${defaultPort} unless one is given. ` +
        `The port is part of the origin: the same host on a different port is a different site to a browser.`,
    );
  }
  if (url.hostname.startsWith('xn--') || url.hostname.includes('.xn--')) {
    notes.push(
      'The host is shown in punycode: URL.hostname returns the ASCII form of an international ' +
        'domain name, which is what is sent to DNS and what a certificate has to cover.',
    );
  }
  if (url.hostname.startsWith('[')) {
    notes.push('The host is an IPv6 address: the brackets keep its colons from being read as a port.');
  }
  if (url.username !== '' || url.password !== '') {
    notes.push(
      url.password !== ''
        ? 'There is a username and password in this URL. Browsers no longer send them, but a log ' +
          'line or a Referer header can still leak them, and the password is visible in the address bar.'
        : 'There is a username in this URL. Browsers no longer send it, but it still ends up in ' +
          'logs and in the Referer header.',
    );
  }
  if (url.hash !== '') {
    notes.push(
      'The fragment is never sent to the server: it is for the client, which is why it is the ' +
        'usual place for a token handed to JavaScript.',
    );
  }

  const keys = new Map<string, number>();
  for (const param of params) keys.set(param.key, (keys.get(param.key) ?? 0) + 1);
  const duplicated = [...keys.entries()].filter(([, count]) => count > 1);
  if (duplicated.length > 0) {
    notes.push(
      `The key${duplicated.length > 1 ? 's' : ''} ${duplicated
        .map(([key]) => `"${key}"`)
        .join(', ')} appear${duplicated.length > 1 ? '' : 's'} more than once. That is legal, and ` +
        `most parsers keep only the first; reading it as a list is usually what the sender meant.`,
    );
  }

  const percentEncoded = /%[0-9a-f]{2}/i;
  if (percentEncoded.test(url.pathname)) {
    notes.push(
      'The path carries percent-escapes. Decoded, it is: ' + safeDecode(url.pathname),
    );
  }

  return {
    href: url.href,
    protocol: url.protocol,
    origin: url.origin,
    username: url.username,
    password: url.password,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
    params,
    notes,
  };
}

/**
 * Decode a percent-encoded string, tolerating the sequences that are not
 * valid UTF-8.
 *
 * A path can hold bytes that are not text at all, and decodeURIComponent
 * throws on those. This is a note in a list of observations, so showing what
 * is there beats refusing.
 */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}
