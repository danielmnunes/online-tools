/**
 * Taking URLs apart.
 *
 * The parsing is the browser's, so what is tested here is the reading of it:
 * that the pieces are the pieces the URL standard says they are, that query
 * values come back decoded, and that the observations fire on the cases they
 * are about -- a default port, a punycode host, a password, a repeated key.
 * Those are the things a person looking at a URL does not see, which is the
 * only reason to have a page for it.
 */
import { describe, expect, it } from 'vitest';
import { parseUrl } from '~/lib/url-parser';

describe('the pieces', () => {
  it('splits a URL into the parts the standard defines', () => {
    const parsed = parseUrl('https://example.com:8443/a/b?q=1&flag#section');
    expect(parsed.protocol).toBe('https:');
    expect(parsed.hostname).toBe('example.com');
    expect(parsed.port).toBe('8443');
    expect(parsed.host).toBe('example.com:8443');
    expect(parsed.pathname).toBe('/a/b');
    expect(parsed.search).toBe('?q=1&flag');
    expect(parsed.hash).toBe('#section');
    expect(parsed.origin).toBe('https://example.com:8443');
  });

  it('decodes query values, and keeps what was there as well', () => {
    const parsed = parseUrl('https://example.com/?q=hello%20world&empty=&plus=a+b');
    expect(parsed.params.map((param) => [param.key, param.value])).toEqual([
      ['q', 'hello world'],
      ['empty', ''],
      ['plus', 'a b'],
    ]);
    // The raw form is what would have to be sent again to mean the same thing.
    expect(parsed.params[0]?.rawValue).toBe('hello%20world');
  });

  it('keeps duplicate keys, in order, because dropping one is a choice', () => {
    const parsed = parseUrl('https://example.com/?tag=a&tag=b&other=1');
    expect(parsed.params.map((param) => param.value)).toEqual(['a', 'b', '1']);
  });

  it('leaves an empty query as no parameters at all', () => {
    expect(parseUrl('https://example.com/a').params).toEqual([]);
    expect(parseUrl('https://example.com/a?').params).toEqual([]);
  });
});

describe('what it says about the URL', () => {
  const notes = (url: string): string => parseUrl(url).notes.join(' ');

  it('explains the port that is not there', () => {
    // https://example.com has no port in it and yet connects to 443, which is
    // the sort of thing that matters when two URLs are compared as strings.
    expect(notes('https://example.com/')).toMatch(/No port is shown because https:\/\/ uses 443/);
  });

  it('says nothing about the port when one is written', () => {
    expect(notes('https://example.com:8443/')).not.toMatch(/No port is shown/);
  });

  it('points out a host that is already punycode', () => {
    // URL.hostname returns the ASCII form, so an international name arrives
    // here as xn-- and the reader deserves to be told why.
    expect(notes('https://xn--bcher-kva.example/')).toMatch(/punycode/);
  });

  it('recognises an IPv6 host by its brackets', () => {
    expect(parseUrl('https://[2001:db8::1]:8080/x').hostname).toBe('[2001:db8::1]');
    expect(notes('https://[2001:db8::1]:8080/x')).toMatch(/IPv6/);
  });

  it('warns about a password in the URL', () => {
    expect(parseUrl('https://user:hunter2@example.com/').password).toBe('hunter2');
    expect(notes('https://user:hunter2@example.com/')).toMatch(/password/);
  });

  it('warns about a username on its own, differently', () => {
    const text = notes('https://user@example.com/');
    expect(text).toMatch(/username/);
    expect(text).not.toMatch(/password in this URL/);
  });

  it('notes a repeated key, because most parsers keep only the first', () => {
    expect(notes('https://example.com/?tag=a&tag=b')).toMatch(/"tag" appears more than once/);
  });

  it('explains that the fragment is never sent', () => {
    expect(notes('https://example.com/#token')).toMatch(/never sent to the server/);
  });

  it('shows what a percent-encoded path decodes to', () => {
    expect(notes('https://example.com/a%20b/c')).toMatch(/Decoded, it is: \/a b\/c/);
  });
});

describe('input that is not a URL', () => {
  it('says a bare host needs a scheme, which is the usual mistake', () => {
    expect(() => parseUrl('example.com/path')).toThrow(/has no scheme/);
  });

  it('reports anything else the parser refuses without pretending to know why', () => {
    expect(() => parseUrl('https://')).toThrow(/not a URL/);
  });

  it('asks for something to parse', () => {
    expect(() => parseUrl('   ')).toThrow(/Paste a URL/);
  });

  it('trims around what was pasted', () => {
    expect(parseUrl('  https://example.com/  ').hostname).toBe('example.com');
  });
});
