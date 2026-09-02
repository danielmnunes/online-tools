import { describe, expect, it } from 'vitest';
import {
  DecodeError,
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  hexToBytes,
  textToBytes,
} from '~/lib/encoding';

describe('hex', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it('accepts the shapes people paste', () => {
    const expected = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(hexToBytes('deadbeef')).toEqual(expected);
    expect(hexToBytes('DEADBEEF')).toEqual(expected);
    expect(hexToBytes('de ad be ef')).toEqual(expected);
    expect(hexToBytes('de:ad:be:ef')).toEqual(expected);
    expect(hexToBytes('0xde 0xad 0xbe 0xef')).toEqual(expected);
  });

  it('rejects odd length and non-hex characters', () => {
    expect(() => hexToBytes('abc')).toThrow(DecodeError);
    expect(() => hexToBytes('zz')).toThrow(DecodeError);
  });

  it('treats empty input as empty output, not an error', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });
});

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('accepts the URL-safe alphabet', () => {
    // 0xfb 0xff encodes as "+/8=" in standard Base64 and "-_8=" URL-safe.
    expect(base64ToBytes('-_8=')).toEqual(base64ToBytes('+/8='));
  });

  it('rejects invalid input', () => {
    expect(() => base64ToBytes('!!!!')).toThrow(DecodeError);
  });
});

describe('textToBytes', () => {
  it('encodes UTF-8 including astral characters', () => {
    // U+1F600, four bytes in UTF-8.
    expect(textToBytes('\u{1F600}', 'utf-8')).toEqual(
      new Uint8Array([0xf0, 0x9f, 0x98, 0x80]),
    );
  });

  it('encodes UTF-16 in both byte orders', () => {
    expect(textToBytes('A', 'utf-16le')).toEqual(new Uint8Array([0x41, 0x00]));
    expect(textToBytes('A', 'utf-16be')).toEqual(new Uint8Array([0x00, 0x41]));
  });

  it('keeps surrogate pairs intact in UTF-16', () => {
    // U+1F600 is D83D DE00; both code units must survive.
    expect(textToBytes('\u{1F600}', 'utf-16be')).toEqual(
      new Uint8Array([0xd8, 0x3d, 0xde, 0x00]),
    );
  });

  it('rejects characters Latin-1 cannot represent', () => {
    expect(() => textToBytes('€', 'latin1')).toThrow(DecodeError);
    expect(textToBytes('é', 'latin1')).toEqual(new Uint8Array([0xe9]));
  });
});
