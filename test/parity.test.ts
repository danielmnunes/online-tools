/**
 * Cross-implementation check.
 *
 * The published vectors in hash.test.ts prove we agree with each specification
 * on a handful of fixed inputs. This proves we agree with OpenSSL -- reached
 * through node:crypto, an implementation sharing no code with @noble/hashes --
 * across a spread of lengths, including the block-boundary lengths where
 * padding bugs live.
 */
import { createHash, createHmac, getHashes, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashBytes, hashBlob } from '~/lib/algo/hash';
import { HASHES, HASH_IDS, type HashId } from '~/lib/algo/hashes';
import { bytesToHex } from '~/lib/encoding';

/** node:crypto's name for each algorithm it implements. */
const OPENSSL_NAME = {
  md5: 'md5',
  sha1: 'sha1',
  ripemd160: 'ripemd160',
  sha224: 'sha224',
  sha256: 'sha256',
  sha384: 'sha384',
  sha512: 'sha512',
  'sha512-224': 'sha512-224',
  'sha512-256': 'sha512-256',
  'sha3-224': 'sha3-224',
  'sha3-256': 'sha3-256',
  'sha3-384': 'sha3-384',
  'sha3-512': 'sha3-512',
  blake2b: 'blake2b512',
  blake2s: 'blake2s256',
} as const satisfies Partial<Record<HashId, string>>;

/**
 * Algorithms OpenSSL does not implement, and how they are verified instead.
 * Listing them here rather than silently skipping means adding an algorithm
 * without any verification is a test failure, not an oversight.
 */
const VERIFIED_ELSEWHERE: Partial<Record<HashId, string>> = {
  'keccak-224': 'published Keccak vectors in hash.test.ts',
  'keccak-256': 'published Keccak vectors in hash.test.ts',
  'keccak-384': 'published Keccak vectors in hash.test.ts',
  'keccak-512': 'published Keccak vectors in hash.test.ts',
  blake3: 'official BLAKE3 vectors in hash.test.ts',
  'double-sha256': 'composed from OpenSSL SHA-256 below',
};

const OPENSSL_IDS = Object.keys(OPENSSL_NAME) as Array<keyof typeof OPENSSL_NAME>;

/**
 * Lengths chosen to sit on and around the block boundaries these algorithms
 * use (64 bytes for the MD/SHA-1/SHA-2-256 family, 128 for SHA-512, 136/72
 * for SHA-3 rates), plus the 55/56-byte edge where the length field stops
 * fitting in the final block and forces an extra one.
 */
const LENGTHS = [0, 1, 55, 56, 63, 64, 65, 71, 72, 111, 112, 127, 128, 135, 136, 137, 1000, 4096];

describe('verification coverage', () => {
  it('accounts for every algorithm in the registry', () => {
    const unverified = HASH_IDS.filter(
      (id) => !(id in OPENSSL_NAME) && !(id in VERIFIED_ELSEWHERE),
    );
    expect(unverified, 'algorithms with no cross-check').toEqual([]);
  });

  it('only claims OpenSSL names this build actually has', () => {
    const available = new Set(getHashes());
    const missing = OPENSSL_IDS.filter((id) => !available.has(OPENSSL_NAME[id]));
    expect(missing, 'OpenSSL names unavailable here').toEqual([]);
  });
});

describe.each(OPENSSL_IDS)('%s matches OpenSSL', (id) => {
  it.each(LENGTHS)('digest of a %i-byte input', async (length) => {
    const data = new Uint8Array(randomBytes(length));
    const expected = createHash(OPENSSL_NAME[id]).update(data).digest('hex');
    expect(bytesToHex(await hashBytes(id, data))).toBe(expected);
  });

  // BLAKE2 and BLAKE3 are declared hmac: false because they take a key
  // natively; wrapping them in HMAC is defined but is not the primitive
  // anyone should reach for, so the tools do not offer it.
  const hmacCases = HASHES[id].hmac ? [1, 20, 64, 65, 128, 200] : [];
  it.each(hmacCases)('HMAC with a %i-byte key', async (keyLength) => {
    const key = new Uint8Array(randomBytes(keyLength));
    const data = new Uint8Array(randomBytes(300));
    const expected = createHmac(OPENSSL_NAME[id], key).update(data).digest('hex');
    expect(bytesToHex(await hashBytes(id, data, { hmacKey: key }))).toBe(expected);
  });

  it('refuses HMAC when the algorithm does not offer it', async () => {
    if (HASHES[id].hmac) return;
    await expect(
      hashBytes(id, new Uint8Array(1), { hmacKey: new Uint8Array(8) }),
    ).rejects.toThrow(/does not support HMAC/);
  });
});

describe('double-sha256 matches composed OpenSSL SHA-256', () => {
  it.each(LENGTHS)('digest of a %i-byte input', async (length) => {
    const data = new Uint8Array(randomBytes(length));
    const once = createHash('sha256').update(data).digest();
    const expected = createHash('sha256').update(once).digest('hex');
    expect(bytesToHex(await hashBytes('double-sha256', data))).toBe(expected);
  });
});

/**
 * The streaming path is a separate implementation from the one-shot path --
 * different noble entry points, and our own chunk loop on top -- so it needs
 * its own check that it lands on the same digest.
 */
describe('streaming a Blob matches hashing it in one piece', () => {
  const CASES: Array<[string, number]> = [
    ['empty', 0],
    ['under one chunk', 1000],
    ['several chunks', 700_000],
  ];

  it.each(CASES)('%s', async (_name, size) => {
    const data = new Uint8Array(randomBytes(size));
    const blob = new Blob([data]);

    for (const id of ['md5', 'sha256', 'sha3-256', 'blake3'] as HashId[]) {
      expect(bytesToHex(await hashBlob(id, blob)), id).toBe(
        bytesToHex(await hashBytes(id, data)),
      );
    }
  });

  it('reports progress that ends at 1', async () => {
    const blob = new Blob([new Uint8Array(randomBytes(500_000))]);
    const seen: number[] = [];
    await hashBlob('sha256', blob, { onProgress: (f) => seen.push(f) });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('honours an abort signal', async () => {
    const blob = new Blob([new Uint8Array(randomBytes(2_000_000))]);
    const controller = new AbortController();
    controller.abort();
    await expect(hashBlob('sha256', blob, { signal: controller.signal })).rejects.toThrow(
      /cancelled/i,
    );
  });
});
