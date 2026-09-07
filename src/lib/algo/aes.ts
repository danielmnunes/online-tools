/**
 * AES via @noble/ciphers.
 *
 * Web Crypto has CBC, CTR and GCM, and does not have ECB or CFB. Using noble
 * for every mode means padding is ours (Web Crypto's CBC only does PKCS#7),
 * ECB exists, and a page that is not GCM does not drag in a second AES.
 * GCM, CBC and CTR are still checked against OpenSSL and against Web Crypto
 * in the tests, which is the parity the PRD asks for.
 */
import { cbc, cfb, ctr, ecb, gcm } from '@noble/ciphers/aes.js';
import type { CipherMode } from './ciphers';
import { pad, unpad, type PaddingId } from './padding';

export interface AesParams {
  key: Uint8Array;
  iv: Uint8Array;
  mode: CipherMode;
  padding: PaddingId;
  aad: Uint8Array;
}

const BLOCK = 16;

function assertKey(key: Uint8Array): void {
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error(`AES needs a 16-, 24- or 32-byte key; got ${key.length}.`);
  }
}

function assertIv(mode: CipherMode, iv: Uint8Array, expected: number): void {
  if (iv.length !== expected) {
    throw new Error(`AES-${mode.toUpperCase()} needs a ${expected}-byte IV; got ${iv.length}.`);
  }
}

export function encryptAes(data: Uint8Array, params: AesParams): Uint8Array {
  assertKey(params.key);
  switch (params.mode) {
    case 'ecb': {
      const padded = pad(data, BLOCK, params.padding);
      return ecb(params.key, { disablePadding: true }).encrypt(padded);
    }
    case 'cbc': {
      assertIv('cbc', params.iv, 16);
      const padded = pad(data, BLOCK, params.padding);
      return cbc(params.key, params.iv, { disablePadding: true }).encrypt(padded);
    }
    case 'ctr':
      assertIv('ctr', params.iv, 16);
      return ctr(params.key, params.iv).encrypt(data);
    case 'cfb':
      assertIv('cfb', params.iv, 16);
      return cfb(params.key, params.iv).encrypt(data);
    case 'gcm':
      assertIv('gcm', params.iv, 12);
      return gcm(params.key, params.iv, params.aad).encrypt(data);
    default:
      throw new Error(`AES does not have a ${params.mode.toUpperCase()} mode.`);
  }
}

export function decryptAes(data: Uint8Array, params: AesParams): Uint8Array {
  assertKey(params.key);
  switch (params.mode) {
    case 'ecb': {
      const plain = ecb(params.key, { disablePadding: true }).decrypt(data);
      return unpad(plain, BLOCK, params.padding);
    }
    case 'cbc': {
      assertIv('cbc', params.iv, 16);
      const plain = cbc(params.key, params.iv, { disablePadding: true }).decrypt(data);
      return unpad(plain, BLOCK, params.padding);
    }
    case 'ctr':
      assertIv('ctr', params.iv, 16);
      return ctr(params.key, params.iv).decrypt(data);
    case 'cfb':
      assertIv('cfb', params.iv, 16);
      return cfb(params.key, params.iv).decrypt(data);
    case 'gcm':
      assertIv('gcm', params.iv, 12);
      if (data.length < 16) {
        throw new Error(
          'AES-GCM ciphertext is the encrypted bytes plus a 16-byte tag; this is shorter than a tag.',
        );
      }
      try {
        return gcm(params.key, params.iv, params.aad).decrypt(data);
      } catch {
        throw new Error(
          'AES-GCM authentication failed. The key, nonce, associated data or ciphertext does not match.',
        );
      }
    default:
      throw new Error(`AES does not have a ${params.mode.toUpperCase()} mode.`);
  }
}
