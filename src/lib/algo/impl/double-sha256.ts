import { sha256 } from '@noble/hashes/sha2.js';

/**
 * SHA-256 applied twice, as used by Bitcoin for block and transaction ids.
 *
 * Hand-assembled rather than imported because no library ships it as a named
 * algorithm, and because the streaming form is not simply "hash the stream
 * twice": the second pass runs over the 32-byte digest of the first, so only
 * the inner hash is fed by update().
 */
const doubleSha256 = Object.assign((message: Uint8Array) => sha256(sha256(message)), {
  outputLen: 32,
  blockLen: 64,
  create() {
    const inner = sha256.create();
    return {
      update(data: Uint8Array) {
        inner.update(data);
        return this;
      },
      digest() {
        return sha256(inner.digest());
      },
    };
  },
});

export default doubleSha256;
