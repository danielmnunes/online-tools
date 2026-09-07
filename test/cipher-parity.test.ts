/**
 * Cross-implementation check for the ciphers OpenSSL implements.
 *
 * Same idea as test/parity.test.ts for hashes: published vectors catch a
 * wrong constant, this catches a wrong mode wiring across lengths. Algorithms
 * OpenSSL does not have are listed in VERIFIED_ELSEWHERE so adding a cipher
 * without a cross-check fails the suite.
 */
import { createCipheriv, getCiphers, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cryptBytes } from '~/lib/algo/cipher';
import { CIPHER_IDS, type CipherId } from '~/lib/algo/ciphers';
import { bytesToHex } from '~/lib/encoding';

const OPENSSL: Partial<
  Record<CipherId, { algorithm: (keyLen: number) => string; iv: number; key: number }>
> = {
  aes: { algorithm: (n) => `aes-${n * 8}-cbc`, iv: 16, key: 16 },
  des: { algorithm: () => 'des-cbc', iv: 8, key: 8 },
  'triple-des': { algorithm: () => 'des-ede3-cbc', iv: 8, key: 24 },
  chacha20: { algorithm: () => 'chacha20', iv: 16, key: 32 },
};

const VERIFIED_ELSEWHERE: Partial<Record<CipherId, string>> = {
  rc4: 'RFC 6229 in rc4.test.ts (OpenSSL 3 hides RC4 behind the legacy provider)',
  speck: 'Beaulieu et al. vectors in speck.test.ts',
  xxtea: 're-derived MX in xxtea.test.ts',
  'chacha20-poly1305': 'RFC 8439 §2.8.2 in cipher.test.ts',
};

describe('verification coverage', () => {
  it('accounts for every cipher in the table', () => {
    const unverified = CIPHER_IDS.filter((id) => !(id in OPENSSL) && !(id in VERIFIED_ELSEWHERE));
    expect(unverified, 'ciphers with no cross-check').toEqual([]);
  });
});

const available = new Set(getCiphers());

function opensslEncrypt(name: string, key: Uint8Array, iv: Uint8Array, data: Uint8Array): Buffer {
  const cipher = createCipheriv(name, Buffer.from(key), Buffer.from(iv));
  return Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
}

describe('AES-CBC matches OpenSSL', () => {
  it.each([16, 24, 32] as const)('AES-%i PKCS#7, several lengths', async (keyLen) => {
    const name = `aes-${keyLen * 8}-cbc`;
    if (!available.has(name)) return;
    const key = new Uint8Array(randomBytes(keyLen));
    const iv = new Uint8Array(randomBytes(16));
    for (const length of [0, 1, 15, 16, 17, 31, 32, 64, 1000]) {
      const data = new Uint8Array(randomBytes(length));
      const ours = await cryptBytes('aes', 'encrypt', data, {
        key,
        iv,
        mode: 'cbc',
        padding: 'pkcs7',
      });
      expect(bytesToHex(ours)).toBe(opensslEncrypt(name, key, iv, data).toString('hex'));
    }
  });
});

describe('AES-GCM matches OpenSSL', () => {
  it.skipIf(!available.has('aes-128-gcm'))('tag is appended, AAD is bound', async () => {
    const key = new Uint8Array(randomBytes(16));
    const iv = new Uint8Array(randomBytes(12));
    const aad = new Uint8Array(randomBytes(8));
    const data = new Uint8Array(randomBytes(33));
    const cipher = createCipheriv('aes-128-gcm', Buffer.from(key), Buffer.from(iv), {
      authTagLength: 16,
    });
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]);
    const expected = Buffer.concat([body, cipher.getAuthTag()]);
    const ours = await cryptBytes('aes', 'encrypt', data, {
      key,
      iv,
      mode: 'gcm',
      padding: 'none',
      aad,
    });
    expect(bytesToHex(ours)).toBe(expected.toString('hex'));
  });
});

describe('DES-CBC matches OpenSSL', () => {
  it.skipIf(!available.has('des-cbc'))('PKCS#7', async () => {
    const key = new Uint8Array(randomBytes(8));
    const iv = new Uint8Array(randomBytes(8));
    const data = new Uint8Array(randomBytes(20));
    const ours = await cryptBytes('des', 'encrypt', data, {
      key,
      iv,
      mode: 'cbc',
      padding: 'pkcs7',
    });
    expect(bytesToHex(ours)).toBe(opensslEncrypt('des-cbc', key, iv, data).toString('hex'));
  });
});

describe('Triple DES-CBC matches OpenSSL', () => {
  it.skipIf(!available.has('des-ede3-cbc'))('three-key PKCS#7', async () => {
    const key = new Uint8Array(randomBytes(24));
    const iv = new Uint8Array(randomBytes(8));
    const data = new Uint8Array(randomBytes(20));
    const ours = await cryptBytes('triple-des', 'encrypt', data, {
      key,
      iv,
      mode: 'cbc',
      padding: 'pkcs7',
    });
    expect(bytesToHex(ours)).toBe(opensslEncrypt('des-ede3-cbc', key, iv, data).toString('hex'));
  });
});

describe('ChaCha20 matches OpenSSL', () => {
  it.skipIf(!available.has('chacha20'))('counter 0, 12-byte nonce as the last 12 of a 16-byte IV', async () => {
    const key = new Uint8Array(randomBytes(32));
    const nonce = new Uint8Array(randomBytes(12));
    const data = new Uint8Array(randomBytes(100));
    const opensslIv = new Uint8Array(16);
    opensslIv.set(nonce, 4);
    const ours = await cryptBytes('chacha20', 'encrypt', data, {
      key,
      iv: nonce,
      mode: 'stream',
      padding: 'none',
    });
    expect(bytesToHex(ours)).toBe(opensslEncrypt('chacha20', key, opensslIv, data).toString('hex'));
  });
});

describe('AES-GCM decrypt matches Web Crypto', () => {
  it('round-trips through subtle.decrypt', async () => {
    if (typeof crypto === 'undefined' || crypto.subtle === undefined) return;
    const key = new Uint8Array(randomBytes(16));
    const iv = new Uint8Array(randomBytes(12));
    const data = new Uint8Array(randomBytes(24));
    const ours = await cryptBytes('aes', 'encrypt', data, {
      key,
      iv,
      mode: 'gcm',
      padding: 'none',
    });
    const cryptoKey = await crypto.subtle.importKey('raw', key.slice(), 'AES-GCM', false, [
      'decrypt',
    ]);
    const plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.slice() }, cryptoKey, ours.slice()),
    );
    expect(plain).toEqual(data);
  });
});
