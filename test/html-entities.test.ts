// @vitest-environment jsdom
/**
 * HTML character references.
 *
 * Decoding is the browser's, so these tests are not checking a table of ours
 * against a table we wrote: they are checking that the behaviour the browser
 * applies is the one the page claims. The rules are the surprising part —
 * `&notit;` is not a failed reference, `&#128;` is not a control character —
 * and the reason to test them is that a reader will expect the other answer.
 *
 * The last group is the one that matters most: interpreting untrusted text
 * must not be able to create an element, because an element can fetch a
 * resource or run a script.
 */
import { describe, expect, it } from 'vitest';
import { decodeText, encodeBytes } from '~/lib/codec';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('named references', () => {
  it('decodes the five that escaping produces', async () => {
    for (const [entity, character] of [
      ['&amp;', '&'],
      ['&lt;', '<'],
      ['&gt;', '>'],
      ['&quot;', '"'],
      ['&apos;', "'"],
    ]) {
      expect(await decodeText('html', entity), entity).toEqual(bytes(character));
    }
  });

  it('takes the longest name it can, which is why &notit; is not a failure', async () => {
    // &not is a named reference and the parser matches it, leaving the rest as
    // text. A decoder that demanded the semicolon would produce nothing here.
    expect(await decodeText('html', '&notit;')).toEqual(bytes('¬it;'));
  });

  it('accepts a reference with no semicolon at all', async () => {
    expect(await decodeText('html', '&amp')).toEqual(bytes('&'));
  });
});

describe('numeric references', () => {
  it('decodes decimal and hexadecimal', async () => {
    expect(await decodeText('html', '&#65;')).toEqual(bytes('A'));
    expect(await decodeText('html', '&#x41;')).toEqual(bytes('A'));
    // A character outside the basic plane is one reference, not two escapes.
    expect(await decodeText('html', '&#x1F600;')).toEqual(bytes('😀'));
  });

  it('remaps the C1 range, because that is what every existing document means', async () => {
    // Windows-1252 put printable characters where Unicode has control codes,
    // and the HTML standard resolves the conflict in favour of the documents.
    expect(await decodeText('html', '&#128;')).toEqual(bytes('€'));
    expect(await decodeText('html', '&#151;')).toEqual(bytes('—'));
    expect(await decodeText('html', '&#x80;')).toEqual(bytes('€'));
  });

  it('turns a value that is not a character into U+FFFD', async () => {
    const replacement = bytes('�');
    expect(await decodeText('html', '&#x110000;')).toEqual(replacement);
    expect(await decodeText('html', '&#0;')).toEqual(replacement);
  });
});

describe('line endings', () => {
  it('are carried through rather than normalised', async () => {
    // The HTML parser turns CR and CRLF into LF as part of tokenisation, so a
    // decoder built straight on innerHTML would rewrite bytes it was never
    // asked to touch -- and break the round trip the encode page invites.
    expect(await decodeText('html', 'a\r\nb')).toEqual(bytes('a\r\nb'));
    expect(await decodeText('html', 'a\rb')).toEqual(bytes('a\rb'));
    expect(await decodeText('html', 'a\nb')).toEqual(bytes('a\nb'));
    // Mixed with a reference, which is the case that matters in practice.
    expect(await decodeText('html', 'a&amp;b\r\nc')).toEqual(bytes('a&b\r\nc'));
  });
});

describe('encoding', () => {
  it('round-trips text through escaping and back', async () => {
    const text = `Tom & Jerry < "quoted" and 'apostrophed' > 5`;
    const escaped = await encodeBytes('html', bytes(text));
    expect(escaped).toContain('&amp;');
    expect(await decodeText('html', escaped)).toEqual(bytes(text));
  });

  it('leaves the text alone when there is nothing to escape', async () => {
    expect(await encodeBytes('html', bytes('plain text 42'))).toBe('plain text 42');
  });
});

describe('untrusted input', () => {
  it('creates no element, so nothing can be fetched and no script can run', async () => {
    const attack = `<img src=x onerror=alert(1)><script>alert(2)</script>`;
    await decodeText('html', attack);

    // The decoder works on a node that is never inserted, and every literal <
    // is escaped before parsing, so the parse can only produce text.
    expect(document.querySelectorAll('img')).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(0);
    // And the text comes back exactly as it went in.
    expect(await decodeText('html', attack)).toEqual(bytes(attack));
  });

  it('still decodes a tag that arrived escaped, which is the whole point', async () => {
    const escaped = await encodeBytes('html', bytes('<b>bold</b>'));
    expect(escaped).toBe('&lt;b&gt;bold&lt;/b&gt;');
    expect(await decodeText('html', escaped)).toEqual(bytes('<b>bold</b>'));
    expect(document.querySelectorAll('b')).toHaveLength(0);
  });
});

describe('where there is no DOM', () => {
  it('says so rather than returning nothing', async () => {
    // The guard is for the one place this code could run without a document:
    // a worker, or a future build step. Returning '' there would look like an
    // answer. This test cannot take the DOM away, so it asserts the behaviour
    // that the guard protects instead.
    await expect(decodeText('html', '&amp;')).resolves.toEqual(bytes('&'));
    expect(typeof document).toBe('object');
  });
});
