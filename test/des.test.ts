/**
 * DES and Triple DES against published vectors and against OpenSSL.
 *
 * The S-boxes are transcribed from FIPS 46-3. These tests are what makes that
 * transcription checked: the first vector is the one in every textbook, and
 * the rest are OpenSSL, which shares no code with src/lib/algo/legacy/des.ts.
 */
import { createCipheriv, getCiphers } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ROTATIONS,
  decryptDesBlock,
  decryptTripleDesBlock,
  encryptDesBlock,
  encryptDesCbc,
  encryptDesEcb,
  encryptTripleDesBlock,
  encryptTripleDesCbc,
} from '~/lib/algo/legacy/des';
import { bytesToHex, hexToBytes } from '~/lib/encoding';

const available = new Set(getCiphers());

/** FIPS 46-3 / every textbook: key 13 34 57 79 9B BC DF F1, block 01 23 45 67 89 AB CD EF. */
const FIPS_KEY = hexToBytes('133457799bbcdff1');
const FIPS_PLAIN = hexToBytes('0123456789abcdef');
const FIPS_CIPHER = hexToBytes('85e813540f0ab405');

describe('the rotation schedule', () => {
  it('is the 1/2 pattern FIPS 46-3 §3 specifies', () => {
    expect([...ROTATIONS]).toEqual([1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]);
    expect(ROTATIONS.reduce((a, b) => a + b, 0)).toBe(28);
  });
});

describe('DES', () => {
  it('matches the FIPS 46-3 single-block vector', () => {
    expect(bytesToHex(encryptDesBlock(FIPS_KEY, FIPS_PLAIN))).toBe(bytesToHex(FIPS_CIPHER));
    expect(bytesToHex(decryptDesBlock(FIPS_KEY, FIPS_CIPHER))).toBe(bytesToHex(FIPS_PLAIN));
  });

  it('round-trips a two-block ECB message', () => {
    const data = hexToBytes('0123456789abcdef fedcba9876543210'.replace(/\s/g, ''));
    const cipher = encryptDesEcb(FIPS_KEY, data);
    expect(cipher.subarray(0, 8)).toEqual(FIPS_CIPHER);
  });
});

function openssl(algorithm: string, key: Uint8Array, iv: Uint8Array, data: Uint8Array): string {
  const cipher = createCipheriv(algorithm, Buffer.from(key), Buffer.from(iv));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()]).toString('hex');
}

describe.skipIf(!available.has('des-ecb'))('DES matches OpenSSL', () => {
  it('ECB of the FIPS block', () => {
    expect(openssl('des-ecb', FIPS_KEY, new Uint8Array(), FIPS_PLAIN)).toBe(bytesToHex(FIPS_CIPHER));
    expect(bytesToHex(encryptDesEcb(FIPS_KEY, FIPS_PLAIN))).toBe(
      openssl('des-ecb', FIPS_KEY, new Uint8Array(), FIPS_PLAIN),
    );
  });

  it('CBC of two blocks', () => {
    const iv = hexToBytes('0000000000000000');
    const data = hexToBytes('0123456789abcdeffedcba9876543210');
    expect(bytesToHex(encryptDesCbc(FIPS_KEY, iv, data))).toBe(
      openssl('des-cbc', FIPS_KEY, iv, data),
    );
  });
});

const TDES_KEY = hexToBytes('0123456789abcdeffedcba987654321089abcdef01234567');
const TDES_2KEY = hexToBytes('0123456789abcdeffedcba9876543210');

describe.skipIf(!available.has('des-ede3-ecb'))('Triple DES matches OpenSSL', () => {
  it('three-key EDE of one block', () => {
    const block = FIPS_PLAIN;
    expect(bytesToHex(encryptTripleDesBlock(TDES_KEY, block))).toBe(
      openssl('des-ede3-ecb', TDES_KEY, new Uint8Array(), block),
    );
    const cipher = encryptTripleDesBlock(TDES_KEY, block);
    expect(decryptTripleDesBlock(TDES_KEY, cipher)).toEqual(block);
  });

  it('two-key EDE (K1 = K3) of one block', () => {
    expect(bytesToHex(encryptTripleDesBlock(TDES_2KEY, FIPS_PLAIN))).toBe(
      openssl('des-ede-ecb', TDES_2KEY, new Uint8Array(), FIPS_PLAIN),
    );
  });

  it('three-key CBC of two blocks', () => {
    const iv = hexToBytes('0011223344556677');
    const data = hexToBytes('0123456789abcdeffedcba9876543210');
    expect(bytesToHex(encryptTripleDesCbc(TDES_KEY, iv, data))).toBe(
      openssl('des-ede3-cbc', TDES_KEY, iv, data),
    );
  });
});

describe('Triple DES decrypt of OpenSSL ciphertext', () => {
  it.skipIf(!available.has('des-ede3-ecb'))('recovers the plaintext', () => {
    const cipher = hexToBytes(openssl('des-ede3-ecb', TDES_KEY, new Uint8Array(), FIPS_PLAIN));
    expect(decryptTripleDesBlock(TDES_KEY, cipher)).toEqual(FIPS_PLAIN);
  });
});
