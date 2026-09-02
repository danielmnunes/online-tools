/**
 * Hash algorithm metadata.
 *
 * Deliberately free of any import from a crypto library: this module is pulled
 * in at build time by Astro pages and by the registry, and must not drag hash
 * implementations into the server build.
 *
 * This table is what generates the tool catalogue. Adding an algorithm here
 * plus a loader in hash.ts plus two MDX files produces two new pages.
 */

export type HashId =
  | 'md5'
  | 'sha1'
  | 'ripemd160'
  | 'sha224'
  | 'sha256'
  | 'double-sha256'
  | 'sha384'
  | 'sha512'
  | 'sha512-224'
  | 'sha512-256'
  | 'sha3-224'
  | 'sha3-256'
  | 'sha3-384'
  | 'sha3-512'
  | 'keccak-224'
  | 'keccak-256'
  | 'keccak-384'
  | 'keccak-512'
  | 'blake2b'
  | 'blake2s'
  | 'blake3';

/** Groups algorithms for "related tools" links. */
export type HashFamily = 'md' | 'sha1' | 'sha2' | 'sha3' | 'keccak' | 'blake' | 'ripemd';

export interface HashMeta {
  readonly id: HashId;
  /** Display name, spelled as the specification spells it. */
  readonly label: string;
  /** Digest length in bits. */
  readonly bits: number;
  readonly family: HashFamily;
  /** Whether the tool offers the HMAC option. */
  readonly hmac: boolean;
  /** Extra search terms beyond the label and id. */
  readonly keywords: ReadonlyArray<string>;
}

export const HASHES: Readonly<Record<HashId, HashMeta>> = {
  md5: { id: 'md5', label: 'MD5', bits: 128, family: 'md', hmac: true, keywords: ['rfc 1321', 'message digest', 'checksum'] },
  sha1: { id: 'sha1', label: 'SHA-1', bits: 160, family: 'sha1', hmac: true, keywords: ['rfc 3174', 'sha-1', 'checksum'] },
  ripemd160: { id: 'ripemd160', label: 'RIPEMD-160', bits: 160, family: 'ripemd', hmac: true, keywords: ['ripemd', 'bitcoin', 'hash160'] },

  sha224: { id: 'sha224', label: 'SHA-224', bits: 224, family: 'sha2', hmac: true, keywords: ['sha2', 'fips 180-4'] },
  sha256: { id: 'sha256', label: 'SHA-256', bits: 256, family: 'sha2', hmac: true, keywords: ['sha2', 'fips 180-4', 'checksum'] },
  'double-sha256': { id: 'double-sha256', label: 'Double SHA-256', bits: 256, family: 'sha2', hmac: false, keywords: ['sha256d', 'bitcoin', 'hash256'] },
  sha384: { id: 'sha384', label: 'SHA-384', bits: 384, family: 'sha2', hmac: true, keywords: ['sha2', 'fips 180-4'] },
  sha512: { id: 'sha512', label: 'SHA-512', bits: 512, family: 'sha2', hmac: true, keywords: ['sha2', 'fips 180-4'] },
  'sha512-224': { id: 'sha512-224', label: 'SHA-512/224', bits: 224, family: 'sha2', hmac: true, keywords: ['sha2', 'truncated', 'fips 180-4'] },
  'sha512-256': { id: 'sha512-256', label: 'SHA-512/256', bits: 256, family: 'sha2', hmac: true, keywords: ['sha2', 'truncated', 'length extension'] },

  'sha3-224': { id: 'sha3-224', label: 'SHA3-224', bits: 224, family: 'sha3', hmac: true, keywords: ['sha3', 'keccak', 'fips 202'] },
  'sha3-256': { id: 'sha3-256', label: 'SHA3-256', bits: 256, family: 'sha3', hmac: true, keywords: ['sha3', 'keccak', 'fips 202'] },
  'sha3-384': { id: 'sha3-384', label: 'SHA3-384', bits: 384, family: 'sha3', hmac: true, keywords: ['sha3', 'keccak', 'fips 202'] },
  'sha3-512': { id: 'sha3-512', label: 'SHA3-512', bits: 512, family: 'sha3', hmac: true, keywords: ['sha3', 'keccak', 'fips 202'] },

  'keccak-224': { id: 'keccak-224', label: 'Keccak-224', bits: 224, family: 'keccak', hmac: true, keywords: ['keccak', 'original padding'] },
  'keccak-256': { id: 'keccak-256', label: 'Keccak-256', bits: 256, family: 'keccak', hmac: true, keywords: ['keccak', 'ethereum', 'solidity'] },
  'keccak-384': { id: 'keccak-384', label: 'Keccak-384', bits: 384, family: 'keccak', hmac: true, keywords: ['keccak', 'original padding'] },
  'keccak-512': { id: 'keccak-512', label: 'Keccak-512', bits: 512, family: 'keccak', hmac: true, keywords: ['keccak', 'original padding'] },

  blake2b: { id: 'blake2b', label: 'BLAKE2b', bits: 512, family: 'blake', hmac: false, keywords: ['blake2', 'rfc 7693', '64-bit'] },
  blake2s: { id: 'blake2s', label: 'BLAKE2s', bits: 256, family: 'blake', hmac: false, keywords: ['blake2', 'rfc 7693', '32-bit'] },
  blake3: { id: 'blake3', label: 'BLAKE3', bits: 256, family: 'blake', hmac: false, keywords: ['blake3', 'fast', 'parallel', 'merkle'] },
};

export const HASH_IDS = Object.keys(HASHES) as HashId[];

export function isHashId(value: string): value is HashId {
  return Object.hasOwn(HASHES, value);
}

/** Other algorithms in the same family, for "related tools". */
export function familySiblings(id: HashId): HashMeta[] {
  const family = HASHES[id].family;
  return HASH_IDS.filter((other) => other !== id && HASHES[other].family === family).map(
    (other) => HASHES[other],
  );
}
