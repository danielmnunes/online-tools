/**
 * Metadata for the symmetric ciphers.
 *
 * Like hashes.ts and codecs.ts, this table is read at build time by the
 * registry and at run time by the widget, and imports no implementation:
 * what it declares is the shape of the control panel. SymmetricCipher.svelte
 * renders a mode, a padding scheme, an IV and an AAD field exactly when the
 * selected cipher and mode have them -- there is no `if (id === 'aes')` in
 * the component.
 */

import type { PaddingId } from './padding';

export type CipherId =
  | 'aes'
  | 'des'
  | 'triple-des'
  | 'rc4'
  | 'chacha20'
  | 'chacha20-poly1305'
  | 'speck'
  | 'xxtea';

export type CipherDirection = 'encrypt' | 'decrypt';

export type CipherMode = 'ecb' | 'cbc' | 'cfb' | 'ctr' | 'gcm' | 'stream';

export interface ByteRange {
  readonly min: number;
  readonly max: number;
}

export interface CipherOption {
  readonly value: string;
  readonly label: string;
}

export interface CipherPage {
  readonly name: string;
  readonly title: string;
  readonly keywords: ReadonlyArray<string>;
}

export interface CipherModeMeta {
  readonly id: CipherMode;
  readonly label: string;
  /** IV / nonce length in bytes. 0 means the mode takes none. */
  readonly ivBytes: number;
  /** Whether the mode encrypts a padded multiple of the block size. */
  readonly padded: boolean;
  /** Authenticated encryption: ciphertext is data plus a tag. */
  readonly aead: boolean;
}

export interface CipherMeta {
  readonly id: CipherId;
  readonly label: string;
  /**
   * Block size in bytes. 0 for a stream cipher, which takes any length and
   * never pads.
   */
  readonly blockBytes: number;
  /** Inclusive range of key lengths the algorithm accepts. */
  readonly key: ByteRange;
  /**
   * Discrete sizes offered in the widget, when the range is not continuous.
   * RC4 accepts any length in range and so has none.
   */
  readonly keyChoices?: ReadonlyArray<number>;
  readonly defaultKeyBytes: number;
  readonly modes: ReadonlyArray<CipherModeMeta>;
  readonly defaultMode: CipherMode;
  readonly paddings: ReadonlyArray<PaddingId>;
  readonly defaultPadding: PaddingId;
  readonly encrypt: CipherPage;
  readonly decrypt: CipherPage;
  readonly blurb: string;
  /**
   * Shown above the widget when the algorithm itself is the problem, not a
   * mode of it. ECB has its own warning, attached to the mode.
   */
  readonly warning?: string;
  readonly keywords: ReadonlyArray<string>;
}

const AES_MODES: ReadonlyArray<CipherModeMeta> = [
  { id: 'cbc', label: 'CBC', ivBytes: 16, padded: true, aead: false },
  { id: 'gcm', label: 'GCM', ivBytes: 12, padded: false, aead: true },
  { id: 'ctr', label: 'CTR', ivBytes: 16, padded: false, aead: false },
  { id: 'cfb', label: 'CFB', ivBytes: 16, padded: false, aead: false },
  { id: 'ecb', label: 'ECB', ivBytes: 0, padded: true, aead: false },
];

const DES_MODES: ReadonlyArray<CipherModeMeta> = [
  { id: 'cbc', label: 'CBC', ivBytes: 8, padded: true, aead: false },
  { id: 'ecb', label: 'ECB', ivBytes: 0, padded: true, aead: false },
];

const SPECK_MODES: ReadonlyArray<CipherModeMeta> = [
  { id: 'cbc', label: 'CBC', ivBytes: 16, padded: true, aead: false },
  { id: 'ecb', label: 'ECB', ivBytes: 0, padded: true, aead: false },
];

const STREAM: CipherModeMeta = {
  id: 'stream',
  label: 'Stream',
  ivBytes: 0,
  padded: false,
  aead: false,
};

const CHACHA_STREAM: CipherModeMeta = {
  id: 'stream',
  label: 'ChaCha20',
  ivBytes: 12,
  padded: false,
  aead: false,
};

const CHACHA_AEAD: CipherModeMeta = {
  id: 'stream',
  label: 'AEAD',
  ivBytes: 12,
  padded: false,
  aead: true,
};

const BLOCK_PADDINGS: ReadonlyArray<PaddingId> = ['pkcs7', 'ansix923', 'iso7816', 'zero', 'none'];

export const CIPHERS: Readonly<Record<CipherId, CipherMeta>> = {
  aes: {
    id: 'aes',
    label: 'AES',
    blockBytes: 16,
    key: { min: 16, max: 32 },
    keyChoices: [16, 24, 32],
    defaultKeyBytes: 16,
    modes: AES_MODES,
    defaultMode: 'cbc',
    paddings: BLOCK_PADDINGS,
    defaultPadding: 'pkcs7',
    encrypt: {
      name: 'AES encrypt',
      title: 'AES Encrypt',
      keywords: ['aes encrypt', 'rijndael', 'aes-256', 'aes-128', 'aes-gcm'],
    },
    decrypt: {
      name: 'AES decrypt',
      title: 'AES Decrypt',
      keywords: ['aes decrypt', 'rijndael', 'aes-256', 'aes-128', 'aes-gcm'],
    },
    blurb: 'The default block cipher: 128-bit blocks, keys of 128, 192 or 256 bits.',
    keywords: ['aes', 'rijndael', 'fips 197', 'nist'],
  },

  des: {
    id: 'des',
    label: 'DES',
    blockBytes: 8,
    key: { min: 8, max: 8 },
    keyChoices: [8],
    defaultKeyBytes: 8,
    modes: DES_MODES,
    defaultMode: 'cbc',
    paddings: BLOCK_PADDINGS,
    defaultPadding: 'pkcs7',
    encrypt: {
      name: 'DES encrypt',
      title: 'DES Encrypt',
      keywords: ['des encrypt', 'data encryption standard', 'fips 46'],
    },
    decrypt: {
      name: 'DES decrypt',
      title: 'DES Decrypt',
      keywords: ['des decrypt', 'data encryption standard', 'fips 46'],
    },
    blurb: '56-bit keys, broken since the 1990s. Here to read what already exists.',
    warning:
      'DES has a 56-bit key. A dedicated machine exhausts that space in hours, and has done ' +
      'since 1998. Do not use it to protect anything. The page exists so ciphertext that is ' +
      'already DES can be read.',
    keywords: ['des', 'fips 46-3', 'data encryption standard'],
  },

  'triple-des': {
    id: 'triple-des',
    label: 'Triple DES',
    blockBytes: 8,
    key: { min: 16, max: 24 },
    keyChoices: [16, 24],
    defaultKeyBytes: 24,
    modes: DES_MODES,
    defaultMode: 'cbc',
    paddings: BLOCK_PADDINGS,
    defaultPadding: 'pkcs7',
    encrypt: {
      name: 'Triple DES encrypt',
      title: 'Triple DES Encrypt',
      keywords: ['3des encrypt', 'triple des', 'des-ede3', 'tdea'],
    },
    decrypt: {
      name: 'Triple DES decrypt',
      title: 'Triple DES Decrypt',
      keywords: ['3des decrypt', 'triple des', 'des-ede3', 'tdea'],
    },
    blurb: 'DES applied three times. Retired by NIST in 2023; 112 bits at best.',
    warning:
      'NIST retired Triple DES in 2023. Two-key Triple DES is 80-bit work; three-key is 112. ' +
      'Neither is a reason to start using it. The page exists to read ciphertext that is ' +
      'already 3DES.',
    keywords: ['triple des', '3des', 'tdea', 'des-ede', 'sp 800-67'],
  },

  rc4: {
    id: 'rc4',
    label: 'RC4',
    blockBytes: 0,
    key: { min: 1, max: 256 },
    defaultKeyBytes: 16,
    modes: [STREAM],
    defaultMode: 'stream',
    paddings: ['none'],
    defaultPadding: 'none',
    encrypt: {
      name: 'RC4 encrypt',
      title: 'RC4 Encrypt',
      keywords: ['rc4 encrypt', 'arcfour', 'arc4', 'stream cipher'],
    },
    decrypt: {
      name: 'RC4 decrypt',
      title: 'RC4 Decrypt',
      keywords: ['rc4 decrypt', 'arcfour', 'arc4', 'stream cipher'],
    },
    blurb: 'A stream cipher retired from TLS. Encryption and decryption are the same operation.',
    warning:
      'RC4 is broken. Biases in the first bytes of its keystream are exploitable, which is why ' +
      'TLS forbade it in 2015. Do not use it to protect anything. The page exists to read ' +
      'ciphertext that is already RC4.',
    keywords: ['rc4', 'arcfour', 'arc4', 'rfc 6229'],
  },

  chacha20: {
    id: 'chacha20',
    label: 'ChaCha20',
    blockBytes: 0,
    key: { min: 32, max: 32 },
    keyChoices: [32],
    defaultKeyBytes: 32,
    modes: [CHACHA_STREAM],
    defaultMode: 'stream',
    paddings: ['none'],
    defaultPadding: 'none',
    encrypt: {
      name: 'ChaCha20 encrypt',
      title: 'ChaCha20 Encrypt',
      keywords: ['chacha20 encrypt', 'chacha', 'rfc 8439', 'stream cipher'],
    },
    decrypt: {
      name: 'ChaCha20 decrypt',
      title: 'ChaCha20 Decrypt',
      keywords: ['chacha20 decrypt', 'chacha', 'rfc 8439', 'stream cipher'],
    },
    blurb: 'IETF ChaCha20: 32-byte key, 12-byte nonce. Unauthenticated; prefer ChaCha20-Poly1305.',
    keywords: ['chacha20', 'chacha', 'rfc 8439', 'bernstein'],
  },

  'chacha20-poly1305': {
    id: 'chacha20-poly1305',
    label: 'ChaCha20-Poly1305',
    blockBytes: 0,
    key: { min: 32, max: 32 },
    keyChoices: [32],
    defaultKeyBytes: 32,
    modes: [CHACHA_AEAD],
    defaultMode: 'stream',
    paddings: ['none'],
    defaultPadding: 'none',
    encrypt: {
      name: 'ChaCha20-Poly1305 encrypt',
      title: 'ChaCha20-Poly1305 Encrypt',
      keywords: ['chacha20-poly1305', 'aead', 'rfc 8439', 'chacha poly1305'],
    },
    decrypt: {
      name: 'ChaCha20-Poly1305 decrypt',
      title: 'ChaCha20-Poly1305 Decrypt',
      keywords: ['chacha20-poly1305', 'aead', 'rfc 8439', 'chacha poly1305'],
    },
    blurb: 'RFC 8439 AEAD. The last 16 bytes of the ciphertext are the Poly1305 tag.',
    keywords: ['chacha20-poly1305', 'poly1305', 'aead', 'rfc 8439'],
  },

  speck: {
    id: 'speck',
    label: 'SPECK',
    blockBytes: 16,
    key: { min: 16, max: 32 },
    keyChoices: [16, 24, 32],
    defaultKeyBytes: 16,
    modes: SPECK_MODES,
    defaultMode: 'cbc',
    paddings: BLOCK_PADDINGS,
    defaultPadding: 'pkcs7',
    encrypt: {
      name: 'SPECK encrypt',
      title: 'SPECK Encrypt',
      keywords: ['speck encrypt', 'speck128', 'lightweight cipher'],
    },
    decrypt: {
      name: 'SPECK decrypt',
      title: 'SPECK Decrypt',
      keywords: ['speck decrypt', 'speck128', 'lightweight cipher'],
    },
    blurb: 'SPECK-128, the 128-bit-block member of the NSA lightweight family.',
    keywords: ['speck', 'speck128', 'simon and speck', 'lightweight'],
  },

  xxtea: {
    id: 'xxtea',
    label: 'XXTEA',
    // The algorithm runs on a whole message of at least two 32-bit words.
    // Padding uses 8 bytes so the result is never shorter than that.
    blockBytes: 8,
    key: { min: 16, max: 16 },
    keyChoices: [16],
    defaultKeyBytes: 16,
    modes: [STREAM],
    defaultMode: 'stream',
    paddings: BLOCK_PADDINGS,
    defaultPadding: 'pkcs7',
    encrypt: {
      name: 'XXTEA encrypt',
      title: 'XXTEA Encrypt',
      keywords: ['xxtea encrypt', 'xtea', 'block tea', 'corrected block tea'],
    },
    decrypt: {
      name: 'XXTEA decrypt',
      title: 'XXTEA Decrypt',
      keywords: ['xxtea decrypt', 'xtea', 'block tea', 'corrected block tea'],
    },
    blurb: 'Corrected Block TEA: a 128-bit key and a message of at least two words.',
    keywords: ['xxtea', 'xtea', 'block tea', 'needham wheeler'],
  },
};

export const CIPHER_IDS = Object.keys(CIPHERS) as CipherId[];

export function isCipherId(value: string): value is CipherId {
  return Object.hasOwn(CIPHERS, value);
}

export function cipherSlug(id: CipherId, direction: CipherDirection): string {
  return `${id}/${direction}`;
}

export function modeMeta(id: CipherId, mode: CipherMode): CipherModeMeta {
  const found = CIPHERS[id].modes.find((entry) => entry.id === mode);
  if (found === undefined) {
    throw new Error(`${CIPHERS[id].label} does not have a ${mode.toUpperCase()} mode.`);
  }
  return found;
}

export function defaultMode(id: CipherId): CipherMode {
  return CIPHERS[id].defaultMode;
}

/** Human-readable form of a size range, for error messages and hints. */
export function describeRange({ min, max }: ByteRange): string {
  return min === max ? `exactly ${min}` : `${min} to ${max}`;
}
