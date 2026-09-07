/**
 * Client-side symmetric encryption, for the eight ciphers in the catalogue.
 *
 * One dynamic import per algorithm so Rollup emits separate chunks: /aes/
 * downloads AES and more nothing, /des/ downloads DES and nothing else.
 * AES and ChaCha20 come from @noble/ciphers; DES, Triple DES, RC4, SPECK
 * and XXTEA are written here, because neither noble nor the Web Crypto API
 * has them.
 */
import {
  CIPHERS,
  describeRange,
  modeMeta,
  type CipherDirection,
  type CipherId,
  type CipherMode,
} from './ciphers';
import type { PaddingId } from './padding';

export interface CipherParams {
  key: Uint8Array;
  iv?: Uint8Array;
  mode: CipherMode;
  padding: PaddingId;
  aad?: Uint8Array;
}

export interface CipherImpl {
  encrypt(data: Uint8Array, params: Required<CipherParams>): Uint8Array;
  decrypt(data: Uint8Array, params: Required<CipherParams>): Uint8Array;
}

const LOADERS: Readonly<Record<CipherId, () => Promise<CipherImpl>>> = {
  aes: () => import('./impl/aes').then((m) => m.default),
  des: () => import('./impl/des').then((m) => m.default),
  'triple-des': () => import('./impl/triple-des').then((m) => m.default),
  rc4: () => import('./impl/rc4').then((m) => m.default),
  chacha20: () => import('./impl/chacha20').then((m) => m.default),
  'chacha20-poly1305': () => import('./impl/chacha20-poly1305').then((m) => m.default),
  speck: () => import('./impl/speck').then((m) => m.default),
  xxtea: () => import('./impl/xxtea').then((m) => m.default),
};

function filled(params: CipherParams): Required<CipherParams> {
  return {
    key: params.key,
    iv: params.iv ?? new Uint8Array(),
    mode: params.mode,
    padding: params.padding,
    aad: params.aad ?? new Uint8Array(),
  };
}

/**
 * Rejects parameters the cipher does not accept, rather than letting them be
 * silently dropped. Getting ciphertext back from a call that asked for GCM
 * and was given CBC is the kind of failure nobody notices until it matters.
 */
export function assertCipherParams(id: CipherId, params: CipherParams): void {
  const meta = CIPHERS[id];
  const { key, iv, mode, padding } = params;
  const chosen = modeMeta(id, mode);

  if (key.length < meta.key.min || key.length > meta.key.max) {
    throw new Error(
      `${meta.label} needs a key of ${describeRange(meta.key)} bytes; got ${key.length}.`,
    );
  }
  if (meta.keyChoices !== undefined && !meta.keyChoices.includes(key.length)) {
    throw new Error(
      `${meta.label} keys are ${meta.keyChoices.join(', ')} bytes; got ${key.length}.`,
    );
  }

  const ivBytes = iv?.length ?? 0;
  if (chosen.ivBytes === 0) {
    if (ivBytes !== 0) {
      throw new Error(`${meta.label} in ${chosen.label} mode does not take an IV.`);
    }
  } else if (ivBytes !== chosen.ivBytes) {
    throw new Error(
      `${meta.label} in ${chosen.label} mode needs a ${chosen.ivBytes}-byte IV; got ${ivBytes}.`,
    );
  }

  if (!chosen.padded && padding !== 'none' && meta.blockBytes === 0) {
    throw new Error(`${meta.label} is a stream cipher and does not pad.`);
  }
  if (chosen.padded && !meta.paddings.includes(padding)) {
    throw new Error(`${meta.label} does not offer ${padding} padding.`);
  }
}

export async function cryptBytes(
  id: CipherId,
  direction: CipherDirection,
  data: Uint8Array,
  params: CipherParams,
): Promise<Uint8Array> {
  assertCipherParams(id, params);
  const impl = await LOADERS[id]();
  const filledParams = filled(params);
  return direction === 'encrypt'
    ? impl.encrypt(data, filledParams)
    : impl.decrypt(data, filledParams);
}
