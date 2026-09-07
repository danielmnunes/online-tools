/**
 * ChaCha20 and ChaCha20-Poly1305 via @noble/ciphers, RFC 8439.
 *
 * Web Crypto has neither. The 12-byte nonce is the IETF form; the original
 * 8-byte-nonce ChaCha20 is not offered, because it is not what TLS, WireGuard
 * or the RFC mean by ChaCha20.
 */
import { chacha20, chacha20poly1305 } from '@noble/ciphers/chacha.js';

export function encryptChacha20(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  assertChacha(key, nonce);
  return chacha20(key, nonce, data);
}

export function decryptChacha20(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array {
  return encryptChacha20(key, nonce, data);
}

export function encryptChacha20Poly1305(
  key: Uint8Array,
  nonce: Uint8Array,
  data: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  assertChacha(key, nonce);
  return chacha20poly1305(key, nonce, aad).encrypt(data);
}

export function decryptChacha20Poly1305(
  key: Uint8Array,
  nonce: Uint8Array,
  data: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  assertChacha(key, nonce);
  if (data.length < 16) {
    throw new Error(
      'ChaCha20-Poly1305 ciphertext is the encrypted bytes plus a 16-byte tag; this is shorter than a tag.',
    );
  }
  try {
    return chacha20poly1305(key, nonce, aad).decrypt(data);
  } catch {
    throw new Error(
      'ChaCha20-Poly1305 authentication failed. The key, nonce, associated data or ciphertext does not match.',
    );
  }
}

function assertChacha(key: Uint8Array, nonce: Uint8Array): void {
  if (key.length !== 32) throw new Error(`ChaCha20 needs a 32-byte key; got ${key.length}.`);
  if (nonce.length !== 12) throw new Error(`ChaCha20 needs a 12-byte nonce; got ${nonce.length}.`);
}
