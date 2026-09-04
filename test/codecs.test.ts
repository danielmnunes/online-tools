/**
 * The codecs, against the specifications that define them.
 *
 * Three kinds of check, in the order this project trusts them:
 *
 * 1. Vectors published by the specification. RFC 4648 §10 gives the encoding
 *    of "f", "fo", ... "foobar" in Base16, Base32 and Base64, and those are
 *    transcribed below rather than generated.
 * 2. Parity with the platform. For percent-encoding there are three functions
 *    every JavaScript runtime has -- encodeURIComponent, encodeURI and
 *    URLSearchParams -- and they are independent of this code, so agreeing
 *    with them is evidence. Base64 and hex go through node:crypto.
 * 3. Re-derivation from the specification. The Base32 alphabets are
 *    transcribed from RFC 4648 and Crockford's page and the encoding of every
 *    five-bit group is computed from them in the test, so the alphabet and the
 *    bit order are both checked against something written down elsewhere. The
 *    Base58Check checksum is rebuilt from SHA-256 by hand.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createStreamingEncoder,
  decodeText,
  defaultOptions,
  encodeBytes,
  type CodecOptions,
} from '~/lib/codec';
import { DecodeError } from '~/lib/encoding';
import { CODECS } from '~/lib/algo/codecs';

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** RFC 4648 §10. */
const RFC4648 = [
  ['', ''],
  ['f', 'Zg=='],
  ['fo', 'Zm8='],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg=='],
  ['fooba', 'Zm9vYmE='],
  ['foobar', 'Zm9vYmFy'],
] as const;

const RFC4648_BASE32 = [
  ['', ''],
  ['f', 'MY======'],
  ['fo', 'MZXQ===='],
  ['foo', 'MZXW6==='],
  ['foob', 'MZXW6YQ='],
  ['fooba', 'MZXW6YTB'],
  ['foobar', 'MZXW6YTBOI======'],
] as const;

const RFC4648_BASE16 = [
  ['', ''],
  ['f', '66'],
  ['fo', '666F'],
  ['foo', '666F6F'],
  ['foob', '666F6F62'],
  ['fooba', '666F6F6261'],
  ['foobar', '666F6F626172'],
] as const;

function options(codec: Parameters<typeof defaultOptions>[0], overrides: CodecOptions = {}): CodecOptions {
  return { ...defaultOptions(codec), ...overrides };
}

describe('Base64', () => {
  it('matches the RFC 4648 test vectors', async () => {
    for (const [text, expected] of RFC4648) {
      expect(await encodeBytes('base64', utf8(text)), text).toBe(expected);
      expect(await decodeText('base64', expected), text).toEqual(utf8(text));
    }
  });

  it('agrees with node for every length, padded and unpadded', async () => {
    const bytes = new Uint8Array(300).map((_, i) => (i * 61) % 256);
    for (let length = 0; length <= 300; length++) {
      const slice = bytes.subarray(0, length);
      const expected = Buffer.from(slice).toString('base64');
      expect(await encodeBytes('base64', slice), `length ${length}`).toBe(expected);

      const unpadded = expected.replace(/=+$/, '');
      expect(
        await encodeBytes('base64', slice, options('base64', { padding: 'off' })),
        `unpadded length ${length}`,
      ).toBe(unpadded);
      // Both forms decode to the same bytes: padding carries no information.
      expect(await decodeText('base64', unpadded)).toEqual(slice);
    }
  });

  it('encodes the URL-safe alphabet as node writes base64url', async () => {
    const bytes = new Uint8Array(120).map((_, i) => (i * 37 + 11) % 256);
    for (let length = 0; length <= 120; length += 1) {
      const slice = bytes.subarray(0, length);
      // Node drops padding on base64url, so the comparison is against its
      // padded form with the two alphabet characters swapped.
      const padded = Buffer.from(slice).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
      expect(await encodeBytes('base64', slice, options('base64', { alphabet: 'url' }))).toBe(padded);
      expect(
        await encodeBytes(
          'base64',
          slice,
          options('base64', { alphabet: 'url', padding: 'off' }),
        ),
      ).toBe(Buffer.from(slice).toString('base64url'));
    }
  });

  it('decodes either alphabet whatever the switch says', async () => {
    // 0xfb 0xff is "+/8=" standard and "-_8=" URL-safe.
    expect(await decodeText('base64', '-_8=')).toEqual(new Uint8Array([0xfb, 0xff]));
    expect(await decodeText('base64', '+/8=', options('base64', { alphabet: 'url' }))).toEqual(
      new Uint8Array([0xfb, 0xff]),
    );
  });

  it('ignores the whitespace an email client added', async () => {
    expect(await decodeText('base64', 'Zm9v\nYmFy\r\n')).toEqual(utf8('foobar'));
  });

  it('rejects a truncated group with a message that says what is wrong', async () => {
    await expect(decodeText('base64', 'Zm9')).rejects.toThrow(DecodeError);
    await expect(decodeText('base64', 'Zm9vx')).rejects.toThrow(/length Base64 can produce/);
  });

  it('rejects non-zero bits where the padding says they should be zero', async () => {
    // "aGl=" would be two bytes plus two bits that are not zero.
    await expect(decodeText('base64', 'aGl=')).rejects.toThrow(/bits that the padding says/);
  });

  it('rejects a character outside the alphabet', async () => {
    await expect(decodeText('base64', 'Zm9v!')).rejects.toThrow(/Not valid Base64/);
  });

  it('wraps output at the width asked for', async () => {
    const bytes = new Uint8Array(100).map((_, i) => i);
    const wrapped = await encodeBytes('base64', bytes, options('base64', { wrap: '64' }));
    expect(wrapped.split('\n').every((line) => line.length <= 64)).toBe(true);
    expect(wrapped.split('\n').length).toBeGreaterThan(1);
    // Wrapping is presentational: it decodes back to the same bytes.
    expect(await decodeText('base64', wrapped)).toEqual(bytes);
  });
});

describe('Base32', () => {
  it('matches the RFC 4648 test vectors', async () => {
    for (const [text, expected] of RFC4648_BASE32) {
      expect(await encodeBytes('base32', utf8(text)), text).toBe(expected);
      expect(await decodeText('base32', expected), text).toEqual(utf8(text));
    }
  });

  it('matches the RFC 4648 §7 extended-hex example', async () => {
    // The same bytes under an alphabet that sorts the way the bytes do.
    expect(await encodeBytes('base32', utf8('foobar'), options('base32', { alphabet: 'hex' }))).toBe(
      'CPNMUOJ1E8======',
    );
  });

  it('encodes each five-bit group where the transcribed alphabets say it belongs', async () => {
    // RFC 4648 §6, §7, and Crockford's page. Encoding one byte produces two
    // characters: the top five bits, then the low three shifted left by two.
    const alphabets: Record<string, string> = {
      rfc4648: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
      hex: '0123456789ABCDEFGHIJKLMNOPQRSTUV',
      crockford: '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
    };

    for (const [alphabet, letters] of Object.entries(alphabets)) {
      for (let byte = 0; byte < 32; byte++) {
        const expected =
          letters[byte >> 3]! + letters[(byte & 0x07) << 2]! + (alphabet === 'crockford' ? '' : '======');
        expect(await encodeBytes('base32', new Uint8Array([byte]), options('base32', { alphabet })), `${alphabet} ${byte}`).toBe(expected);
      }
    }
  });

  it('never writes I, L, O or U in Crockford', async () => {
    const bytes = new Uint8Array(64).map((_, i) => (i * 97) % 256);
    const encoded = await encodeBytes('base32', bytes, options('base32', { alphabet: 'crockford' }));
    expect(encoded).not.toMatch(/[ILOU]/);
  });

  it('reads O as zero and I and L as one when decoding Crockford', async () => {
    // Crockford's page: decoding is case-insensitive and maps O to 0, and I
    // and L to 1, so that a value read aloud can still be typed in.
    const plain = await encodeBytes('base32', utf8('f'), options('base32', { alphabet: 'crockford' }));
    expect(plain).toBe('CR');
    expect(await decodeText('base32', 'cr', options('base32', { alphabet: 'crockford' }))).toEqual(utf8('f'));
    expect(await decodeText('base32', 'cR', options('base32', { alphabet: 'crockford' }))).toEqual(utf8('f'));
  });

  it('accepts lowercase input for the RFC alphabets', async () => {
    expect(await decodeText('base32', 'mzxw6ytboi======')).toEqual(utf8('foobar'));
    expect(await decodeText('base32', 'mzxw6ytboi')).toEqual(utf8('foobar'));
  });

  it('round-trips every length in every variant', async () => {
    const bytes = new Uint8Array(200).map((_, i) => (i * 53 + 7) % 256);
    for (const alphabet of ['rfc4648', 'hex', 'crockford']) {
      for (const padding of ['on', 'off']) {
        for (let length = 0; length <= 200; length++) {
          const slice = bytes.subarray(0, length);
          const encoded = await encodeBytes('base32', slice, options('base32', { alphabet, padding }));
          expect(await decodeText('base32', encoded, options('base32', { alphabet })), `${alphabet} ${padding} ${length}`).toEqual(slice);
        }
      }
    }
  });

  it('rejects a length that no input could have produced', async () => {
    // Nine characters is one more than a full group; the decoder would rather
    // say what is impossible than emit something.
    await expect(decodeText('base32', 'MZXW6YTBX')).rejects.toThrow(/length Base32 can produce/);
  });

  it('rejects a character outside the alphabet', async () => {
    await expect(decodeText('base32', 'MZXW6YT1')).rejects.toThrow(/Not valid Base32/);
  });
});

describe('Base16', () => {
  it('matches the RFC 4648 test vectors', async () => {
    for (const [text, expected] of RFC4648_BASE16) {
      expect(await encodeBytes('base16', utf8(text), options('base16', { case: 'upper' })), text).toBe(expected);
      expect(await decodeText('base16', expected), text).toEqual(utf8(text));
    }
  });

  it('emits the case it is asked for and accepts both', async () => {
    expect(await encodeBytes('base16', utf8('foo'))).toBe('666f6f');
    expect(await encodeBytes('base16', utf8('foo'), options('base16', { case: 'upper' }))).toBe('666F6F');
    expect(await decodeText('base16', '666F6F')).toEqual(utf8('foo'));
    expect(await decodeText('base16', '666f6f')).toEqual(utf8('foo'));
  });

  it('tolerates the shapes people paste', async () => {
    const expected = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(await decodeText('base16', 'de:ad:be:ef')).toEqual(expected);
    expect(await decodeText('base16', '0xde 0xad 0xbe 0xef')).toEqual(expected);
  });

  it('rejects an odd number of digits', async () => {
    await expect(decodeText('base16', 'abc')).rejects.toThrow(/even number of digits/);
  });
});

describe('Base58', () => {
  it('matches the published vectors', async () => {
    // "Hello World!" and the Bitcoin wiki's address example are the two values
    // every implementation is checked against.
    expect(await encodeBytes('base58', utf8('Hello World!'))).toBe('2NEpo7TZRRrLZSi2U');
    expect(await decodeText('base58', '2NEpo7TZRRrLZSi2U')).toEqual(utf8('Hello World!'));
  });

  it('encodes leading zero bytes as ones', async () => {
    // Zero is the first character of the alphabet, and the values are
    // big-endian, so a leading zero byte is a leading "1" that a bignum would
    // otherwise lose.
    expect(await encodeBytes('base58', new Uint8Array([0]))).toBe('1');
    expect(await encodeBytes('base58', new Uint8Array([0, 0]))).toBe('11');
    expect(await encodeBytes('base58', new Uint8Array([0, 0, 1]))).toBe('112');
    expect(await decodeText('base58', '112')).toEqual(new Uint8Array([0, 0, 1]));
  });

  it('round-trips random bytes in every variant', async () => {
    const bytes = new Uint8Array(128).map((_, i) => (i * 43 + 5) % 256);
    for (const variant of ['bitcoin', 'flickr', 'xmr', 'xrp']) {
      for (let length = 0; length <= 128; length += 7) {
        const slice = bytes.subarray(0, length);
        const encoded = await encodeBytes('base58', slice, options('base58', { variant }));
        expect(await decodeText('base58', encoded, options('base58', { variant })), `${variant} ${length}`).toEqual(slice);
      }
    }
  });

  it('gives the same bytes a different string under each alphabet', async () => {
    const bytes = utf8('Hello World!');
    const encoded = new Set(
      await Promise.all(
        ['bitcoin', 'flickr', 'xmr', 'xrp'].map((variant) =>
          encodeBytes('base58', bytes, options('base58', { variant })),
        ),
      ),
    );
    expect(encoded.size).toBe(4);
  });

  it('refuses an input large enough to be slow, and says why', async () => {
    // Base58 is quadratic: past a few kilobytes it stops being instant.
    const tooLong = new Uint8Array(4096).fill(7);
    await expect(encodeBytes('base58', tooLong)).rejects.toThrow(/square of the length/);
    await expect(decodeText('base58', 'z'.repeat(9000))).rejects.toThrow(/square of the length/);
  });

  it('rejects a character the alphabet does not have', async () => {
    // 0, O, I and l are the four characters Bitcoin leaves out on purpose.
    await expect(decodeText('base58', '0OIl')).rejects.toThrow(/Not valid Base58/);
  });
});

describe('Base58Check', () => {
  /** The Bitcoin wiki's worked example: version 0 + a 20-byte hash. */
  const PAYLOAD = '00010966776006953D5567439E5E39F86A0D273BEE';
  const ADDRESS = '16UwLL9Risc3QfPqBUvKofHmBQ7wMtjvM';

  it('produces the published address', async () => {
    const bytes = await decodeText('base16', PAYLOAD);
    expect(await encodeBytes('base58', bytes, options('base58', { variant: 'check' }))).toBe(ADDRESS);
    expect(await decodeText('base58', ADDRESS, options('base58', { variant: 'check' }))).toEqual(bytes);
  });

  it('appends four bytes of double SHA-256, computed here rather than assumed', async () => {
    const bytes = await decodeText('base16', PAYLOAD);
    const encoded = await encodeBytes('base58', bytes, options('base58', { variant: 'check' }));

    // Re-derive the checksum from the specification. The checked form hides
    // it on the way back, so the string is read here as plain Base58.
    const digest = createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
    const raw = await decodeText('base58', encoded, options('base58', { variant: 'bitcoin' }));
    expect(Array.from(raw)).toEqual([...bytes, ...digest.subarray(0, 4)]);

    // And decoding with the check on gives the payload back alone.
    expect(await decodeText('base58', encoded, options('base58', { variant: 'check' }))).toEqual(bytes);
  });

  it('rejects a string whose checksum does not match', async () => {
    // One character changed: the checksum is what turns that into an error
    // instead of a payment to nobody.
    const broken = ADDRESS.slice(0, -1) + (ADDRESS.endsWith('M') ? 'N' : 'M');
    await expect(decodeText('base58', broken, options('base58', { variant: 'check' }))).rejects.toThrow(
      /Not valid Base58|checksum/i,
    );
  });
});

describe('percent-encoding', () => {
  const samples = [
    '',
    'hello',
    'a b',
    'a/b?c=d&e',
    "quote's and \"double\"",
    'plus+and%percent',
    'tilde~and!bang',
    'parentheses() and *star*',
    'ünïcodé ✓ 😀',
    'https://example.com/path?q=1#frag',
    '100% & more',
  ];

  it('agrees with encodeURIComponent in component mode', async () => {
    for (const sample of samples) {
      expect(await encodeBytes('url', utf8(sample)), sample).toBe(encodeURIComponent(sample));
    }
  });

  it('agrees with encodeURI in whole-URL mode', async () => {
    for (const sample of samples) {
      expect(await encodeBytes('url', utf8(sample), options('url', { mode: 'uri' })), sample).toBe(
        encodeURI(sample),
      );
    }
  });

  it('agrees with the platform form serializer in form mode', async () => {
    // URLSearchParams is the urlencoded serializer the browser itself uses,
    // so agreeing with it means agreeing with what a form would have sent.
    for (const sample of samples) {
      const expected = new URLSearchParams([['v', sample]]).toString().slice(2);
      expect(await encodeBytes('url', utf8(sample), options('url', { mode: 'form' })), sample).toBe(expected);
    }
  });

  it('leaves nothing but RFC 3986 unreserved in strict mode', async () => {
    // Unreserved is ALPHA / DIGIT / "-" / "." / "_" / "~", so even the
    // sub-delimiters component mode keeps are escaped here.
    const encoded = await encodeBytes('url', utf8(`a!*'()~b c`), options('url', { mode: 'strict' }));
    expect(encoded).toBe('a%21%2A%27%28%29~b%20c');
  });

  it('decodes with decodeURIComponent and with the form parser', async () => {
    for (const sample of samples) {
      const encoded = await encodeBytes('url', utf8(sample));
      expect(await decodeText('url', encoded), sample).toEqual(utf8(sample));

      const formEncoded = await encodeBytes('url', utf8(sample), options('url', { mode: 'form' }));
      // The platform's own parser, reading the same string.
      expect(new URLSearchParams(`v=${formEncoded}`).get('v'), sample).toBe(sample);
      expect(await decodeText('url', formEncoded, options('url', { mode: 'form' })), sample).toEqual(utf8(sample));
    }
  });

  it('treats + as a plus outside form mode', async () => {
    expect(await decodeText('url', 'a+b')).toEqual(utf8('a+b'));
    expect(await decodeText('url', 'a+b', options('url', { mode: 'form' }))).toEqual(utf8('a b'));
  });

  it('percent-encodes bytes that are not text at all', async () => {
    // A hex box feeding bytes in is a case the string functions cannot see.
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
    expect(await encodeBytes('url', bytes)).toBe('%FF%FE%00%80');
  });

  it('reports where a broken escape is', async () => {
    await expect(decodeText('url', 'abc%zz')).rejects.toThrow(/position 4/);
    await expect(decodeText('url', 'abc%4')).rejects.toThrow(/two hexadecimal digits/);
  });

  it('round-trips arbitrary bytes in every mode', async () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    for (const mode of ['component', 'uri', 'form', 'strict']) {
      const encoded = await encodeBytes('url', bytes, options('url', { mode }));
      expect(await decodeText('url', encoded, options('url', { mode })), mode).toEqual(bytes);
    }
  });
});

describe('HTML entities', () => {
  it('escapes the five characters that can change the parse', async () => {
    expect(await encodeBytes('html', utf8(`&<>"'`))).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('escapes only the three when asked', async () => {
    expect(await encodeBytes('html', utf8(`&<>"'`), options('html', { scope: 'three' }))).toBe(
      '&amp;&lt;&gt;"\'',
    );
  });

  it('writes numeric references in the form asked for', async () => {
    expect(await encodeBytes('html', utf8('&<'), options('html', { form: 'decimal' }))).toBe('&#38;&#60;');
    expect(await encodeBytes('html', utf8('&<'), options('html', { form: 'hex' }))).toBe('&#x26;&#x3C;');
  });

  it('escapes non-ASCII only when asked, and then numerically', async () => {
    expect(await encodeBytes('html', utf8('€'))).toBe('€');
    expect(await encodeBytes('html', utf8('€'), options('html', { scope: 'non-ascii' }))).toBe('&#x20AC;');
    expect(
      await encodeBytes('html', utf8('€'), options('html', { scope: 'non-ascii', form: 'decimal' })),
    ).toBe('&#8364;');
  });

  it('treats an astral character as one entity', async () => {
    // Two code units, one code point: the split version would be two
    // malformed references.
    expect(await encodeBytes('html', utf8('😀'), options('html', { scope: 'non-ascii' }))).toBe(
      '&#x1F600;',
    );
  });

  it('refuses bytes that are not text, because escaping needs text', async () => {
    // A lone continuation byte: valid as bytes, meaningless as UTF-8.
    await expect(encodeBytes('html', new Uint8Array([0xff]))).rejects.toThrow(/not valid UTF-8/);
  });

  it('neutralises the injection attempt that gives this tool its reason to exist', async () => {
    const attack = `<script>alert('xss')</script>`;
    const escaped = await encodeBytes('html', utf8(attack));
    expect(escaped).not.toContain('<');
    expect(escaped).toBe('&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;');
  });
});

describe('the streaming encoder', () => {
  it('produces exactly what the one-shot encoder produces', async () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 31 + 3) % 256);
    const codecs = ['base16', 'base32', 'base64'] as const;

    for (const codec of codecs) {
      for (const overrides of [
        {},
        { padding: 'off' },
        { alphabet: codec === 'base64' ? 'url' : 'hex' },
        { wrap: '64' },
      ] as ReadonlyArray<Record<string, string>>) {
        // Options that do not belong to this codec are simply not in the
        // table, so passing them through is harmless.
        const opts = options(codec, overrides);
        const expected = await encodeBytes(codec, bytes, opts);

        for (const chunkSize of [1, 2, 3, 4, 5, 7, 16, 511, 1000]) {
          const encoder = createStreamingEncoder(codec, opts);
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            encoder.update(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
          }
          expect(encoder.finish(), `${codec} ${JSON.stringify(overrides)} chunk ${chunkSize}`).toBe(expected);
        }
      }
    }
  });

  it('starts from nothing and ends with an empty file', async () => {
    const encoder = createStreamingEncoder('base64', options('base64'));
    encoder.update(new Uint8Array(0));
    expect(encoder.finish()).toBe('');
  });

  it('pads only the final partial group', async () => {
    const encoder = createStreamingEncoder('base64', options('base64'));
    // Three bytes is a whole group; adding one more byte must produce a
    // second group and a padding character, not two unpadded groups.
    encoder.update(new Uint8Array([1, 2, 3]));
    encoder.update(new Uint8Array([4]));
    expect(encoder.finish()).toBe('AQIDBA==');
  });

  it('has nothing to offer for a codec that is not produced a chunk at a time', () => {
    expect(() => createStreamingEncoder('base58', options('base58'))).toThrow(/chunk at a time/);
  });
});

describe('option handling', () => {
  it('defaults every control to the value the table declares', () => {
    for (const codec of Object.values(CODECS)) {
      const defaults = defaultOptions(codec.id);
      for (const control of codec.controls) expect(defaults[control.id], `${codec.id}.${control.id}`).toBe(control.default);
    }
  });

  it('rejects a value the table does not list', async () => {
    await expect(encodeBytes('base64', utf8('x'), options('base64', { alphabet: 'base32' }))).rejects.toThrow(
      /not an accepted value/,
    );
  });

  it('ignores a control that belongs to the other direction', async () => {
    // Padding is a choice about what to emit, so it has no meaning here.
    expect(await decodeText('base64', 'Zm9v', options('base64', { padding: 'off' }))).toEqual(utf8('foo'));
  });
});
