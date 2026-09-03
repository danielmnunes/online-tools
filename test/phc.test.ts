/**
 * The strings password hashes are stored as.
 *
 * Parsing these is where a verifier quietly goes wrong: a mis-read iteration
 * count or a salt decoded with the wrong padding rule produces a "no match"
 * that looks exactly like a wrong password. So the tests here are mostly about
 * rejecting malformed input loudly rather than accepting it approximately.
 */
import { describe, expect, it } from 'vitest';
import {
  b64NoPad,
  formatArgon2,
  formatDjango,
  formatScrypt,
  looksEncoded,
  parseEncoded,
} from '~/lib/phc';
import { bytesToHex, textToBytes } from '~/lib/encoding';

const utf8 = (text: string) => textToBytes(text, 'utf-8');

describe('Argon2 PHC strings', () => {
  const sample =
    '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG';

  it('reads the variant, version, parameters, salt and digest', () => {
    const parsed = parseEncoded(sample);
    expect(parsed.kind).toBe('argon2');
    expect(parsed.algorithm).toBe('argon2id');
    expect(parsed.version).toBe(19);
    expect(parsed.cost).toEqual({ m: 19456, t: 2, p: 1 });
    expect(new TextDecoder().decode(parsed.salt)).toBe('somesalt');
    expect(parsed.digest.length).toBe(24);
  });

  it.each(['argon2d', 'argon2i', 'argon2id'])('reads the %s variant', (variant) => {
    const parsed = parseEncoded(sample.replace('argon2id', variant));
    expect(parsed.algorithm).toBe(variant);
  });

  it('treats a missing version field as the 2015 layout', () => {
    const parsed = parseEncoded('$argon2i$m=8,t=1,p=1$c29tZXNhbHQ$RdescudvJCsg');
    expect(parsed.version).toBe(0x10);
  });

  it('round-trips through format and parse', () => {
    const salt = utf8('sixteen bytes!!!');
    const digest = Uint8Array.from({ length: 32 }, (_, i) => (i * 17 + 3) & 0xff);
    const parsed = parseEncoded(formatArgon2('argon2id', { m: 64, t: 3, p: 2 }, salt, digest));

    expect(parsed.cost).toEqual({ m: 64, t: 3, p: 2 });
    expect(bytesToHex(parsed.salt)).toBe(bytesToHex(salt));
    expect(bytesToHex(parsed.digest)).toBe(bytesToHex(digest));
  });

  it.each([
    ['$argon2id$v=19$t=2,p=1$c29tZXNhbHQ$RdescudvJCsg', /needs m/],
    ['$argon2id$v=19$m=abc,t=2,p=1$c29tZXNhbHQ$RdescudvJCsg', /whole number/],
    ['$argon2id$v=19$m=8,t=2,p=1$c29tZXNhbHQ', /needs parameters, a salt and a digest/],
    ['$argon2id$v=19$m=8t=2$c29tZXNhbHQ$Rdes', /"m" must be a whole number/],
    ['$argon2id$v=19$m$c29tZXNhbHQ$Rdes', /not a name=value parameter/],
  ])('rejects %j', (bad, message) => {
    expect(() => parseEncoded(bad)).toThrow(message);
  });
});

describe('scrypt PHC strings', () => {
  it('turns ln back into N', () => {
    const parsed = parseEncoded('$scrypt$ln=14,r=8,p=1$c29tZXNhbHQ$RdescudvJCsg');
    expect(parsed.algorithm).toBe('scrypt');
    expect(parsed.cost).toEqual({ N: 16384, r: 8, p: 1 });
  });

  it('writes log2(N) rather than N', () => {
    const encoded = formatScrypt({ N: 1024, r: 8, p: 1 }, utf8('salt'), utf8('digest'));
    expect(encoded).toMatch(/^\$scrypt\$ln=10,r=8,p=1\$/);
  });

  it('has nothing to write when N is not a power of two', () => {
    expect(formatScrypt({ N: 1000, r: 8, p: 1 }, utf8('salt'), utf8('d'))).toBeUndefined();
  });

  it.each([
    ['$scrypt$ln=14,r=8,p=1$c29tZXNhbHQ', /needs parameters, a salt and a digest/],
    ['$scrypt$r=8,p=1$c29tZXNhbHQ$RdescudvJCsg', /needs ln/],
    ['$scrypt$ln=99,r=8,p=1$c29tZXNhbHQ$RdescudvJCsg', /"ln" must be from 1 to 30/],
    ['$scrypt$ln=14,p=1$c29tZXNhbHQ$RdescudvJCsg', /needs r/],
  ])('rejects %j', (bad, message) => {
    expect(() => parseEncoded(bad)).toThrow(message);
  });
});

describe('Django PBKDF2 strings', () => {
  const sample = 'pbkdf2_sha256$600000$abcdefgh$RdescudvJCsgt3ub+b+dWRWJTmaaJObG1234567890=';

  it('reads the hash, iteration count and plain-text salt', () => {
    const parsed = parseEncoded(sample);
    expect(parsed.kind).toBe('django-pbkdf2');
    expect(parsed.algorithm).toBe('pbkdf2');
    expect(parsed.hash).toBe('sha256');
    expect(parsed.cost).toEqual({ iterations: 600000 });
    expect(new TextDecoder().decode(parsed.salt)).toBe('abcdefgh');
  });

  it('round-trips through format and parse', () => {
    const digest = Uint8Array.from({ length: 32 }, (_, i) => i);
    const encoded = formatDjango('sha512', 12000, utf8('saltyness'), digest)!;
    const parsed = parseEncoded(encoded);

    expect(parsed.hash).toBe('sha512');
    expect(parsed.cost['iterations']).toBe(12000);
    expect(bytesToHex(parsed.digest)).toBe(bytesToHex(digest));
  });

  it('keeps the base64 padding Django keeps', () => {
    const encoded = formatDjango('sha256', 1, utf8('salt'), new Uint8Array(31))!;
    expect(encoded.endsWith('=')).toBe(true);
  });

  it('declines to write a string when the salt would make it ambiguous', () => {
    expect(formatDjango('sha256', 1, utf8('has$dollar'), new Uint8Array(4))).toBeUndefined();
    expect(formatDjango('sha256', 1, Uint8Array.from([0xff, 0xfe]), new Uint8Array(4))).toBeUndefined();
  });

  it.each([
    ['pbkdf2_sha256$600000$abcdefgh', /four fields/],
    ['pbkdf2_md4$1000$salt$Rdes', /not a hash this tool can use/],
    ['pbkdf2_blake2b$1000$salt$Rdes', /not a hash this tool can use/],
    ['pbkdf2_sha256$many$salt$Rdes', /whole number/],
  ])('rejects %j', (bad, message) => {
    expect(() => parseEncoded(bad)).toThrow(message);
  });
});

describe('recognising an encoded hash at all', () => {
  it.each([
    '$argon2id$v=19$m=8,t=1,p=1$c29tZQ$Rdes',
    '$scrypt$ln=10,r=8,p=1$c29tZQ$Rdes',
    'pbkdf2_sha256$1$s$Rdes',
    '  $argon2i$v=19$m=8,t=1,p=1$c29tZQ$Rdes  ',
  ])('recognises %j', (text) => {
    expect(looksEncoded(text)).toBe(true);
  });

  it.each(['deadbeef', 'RdescudvJCsg', '', '   '])('does not mistake %j for one', (text) => {
    expect(looksEncoded(text)).toBe(false);
  });

  it('names the formats it does read when given something else', () => {
    expect(() => parseEncoded('deadbeef')).toThrow(/argon2id.*scrypt.*2a.*pbkdf2_sha256/s);
    expect(() => parseEncoded('$md5$abc$def')).toThrow(/"\$md5\$" is not a format this tool reads/);
  });
});

describe('PHC base64', () => {
  it('drops the padding', () => {
    expect(b64NoPad(new Uint8Array(1))).toBe('AA');
    expect(b64NoPad(new Uint8Array(2))).toBe('AAA');
    expect(b64NoPad(new Uint8Array(3))).toBe('AAAA');
  });

  it('reads back what it writes, at every padding remainder', () => {
    for (const length of [1, 2, 3, 4, 5, 16, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 29 + 7) & 0xff);
      const encoded = `$argon2id$v=19$m=8,t=1,p=1$${b64NoPad(bytes)}$${b64NoPad(bytes)}`;
      const parsed = parseEncoded(encoded);
      expect(bytesToHex(parsed.salt), `length ${length}`).toBe(bytesToHex(bytes));
    }
  });

  it('rejects a salt that is not base64 at all', () => {
    expect(() => parseEncoded('$argon2id$v=19$m=8,t=1,p=1$!!!!$Rdes')).toThrow(/not valid base64/);
  });
});
