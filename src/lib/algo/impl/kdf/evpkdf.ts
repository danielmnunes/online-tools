import type { CHash } from '@noble/hashes/utils.js';

/**
 * OpenSSL's EVP_BytesToKey, the derivation behind `openssl enc -pass pass:...`
 * and CryptoJS's default.
 *
 * Written out rather than imported because no library exposes it: node:crypto
 * keeps it internal and noble has no reason to ship it. It is only a few lines,
 * and they are worth reading, because what they show is how little there is:
 *
 *     D_1 = H(password || salt)
 *     D_i = H(D_(i-1) || password || salt)
 *
 * concatenated until enough bytes exist. One MD5 per 16 bytes, by default.
 * That is not a password hash and was never meant to be one -- it is a way to
 * turn a passphrase into key-and-IV bytes, from an era when that was thought
 * sufficient. It is here because files encrypted with it still exist.
 */
export function evpKdf(
  hash: CHash,
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  dkLen: number,
): Uint8Array {
  const out = new Uint8Array(dkLen);
  let written = 0;
  let previous = new Uint8Array(0);

  while (written < dkLen) {
    const input = new Uint8Array(previous.length + password.length + salt.length);
    input.set(previous, 0);
    input.set(password, previous.length);
    input.set(salt, previous.length + password.length);

    let block = hash(input);
    // OpenSSL's count re-hashes the block itself, without the password again.
    for (let i = 1; i < iterations; i++) block = hash(block);

    const take = Math.min(block.length, dkLen - written);
    out.set(block.subarray(0, take), written);
    written += take;
    previous = block;
  }

  return out;
}
