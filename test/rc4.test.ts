/**
 * RC4 against RFC 6229 and against OpenSSL.
 */
import { createCipheriv, getCiphers } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rc4 } from '~/lib/algo/legacy/rc4';
import { bytesToHex, hexToBytes } from '~/lib/encoding';

const available = new Set(getCiphers());

describe('RFC 6229', () => {
  it('vector 1: 40-bit key, first 16 bytes of keystream', () => {
    const key = hexToBytes('0102030405');
    const zeros = new Uint8Array(16);
    expect(bytesToHex(rc4(key, zeros))).toBe('b2396305f03dc027ccc3524a0a1118a8');
  });

  it('vector 3: 128-bit key', () => {
    const key = hexToBytes('0102030405060708090a0b0c0d0e0f10');
    const zeros = new Uint8Array(16);
    expect(bytesToHex(rc4(key, zeros))).toBe('9ac7cc9a609d1ef7b2932899cde41b97');
  });

  it('encrypt and decrypt are the same function', () => {
    const key = hexToBytes('0123456789abcdef');
    const data = new TextEncoder().encode('RC4 is a stream cipher');
    expect(rc4(key, rc4(key, data))).toEqual(data);
  });
});

describe.skipIf(!available.has('rc4'))('RC4 matches OpenSSL', () => {
  it('agrees on 64 bytes of a 16-byte key', () => {
    const key = hexToBytes('00112233445566778899aabbccddeeff');
    const data = new Uint8Array(64);
    for (let i = 0; i < data.length; i++) data[i] = i;
    const openssl = createCipheriv('rc4', Buffer.from(key), null);
    const expected = Buffer.concat([openssl.update(Buffer.from(data)), openssl.final()]).toString(
      'hex',
    );
    expect(bytesToHex(rc4(key, data))).toBe(expected);
  });
});
