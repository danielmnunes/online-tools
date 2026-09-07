/**
 * DES, written from FIPS 46-3.
 *
 * Neither the Web Crypto API nor @noble/ciphers has DES. The S-boxes and the
 * permutation tables have no generating formula -- they are specified as
 * tables -- so they are transcribed here and checked against NIST vectors and
 * against OpenSSL, which share no code with this file.
 *
 * Bits are numbered 1 to 64 from the most-significant end, the way FIPS 46-3
 * numbers them. A 64-bit block is a BigInt; eight-byte arrays on the way in
 * and out are big-endian.
 */
import { cbcDecrypt, cbcEncrypt, ecbDecrypt, ecbEncrypt } from '../modes';

/** 1-indexed bit positions, MSB = 1, as FIPS 46-3 prints them. */
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64,
  56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53,
  45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];

const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37,
  5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2,
  42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];

const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19,
  20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13,
  30, 6, 22, 11, 4, 25,
];

const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60,
  52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21,
  13, 5, 28, 20, 12, 4,
];

const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52,
  31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

/** Left-shift schedule for C and D. Specified, not derived. */
export const ROTATIONS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1] as const;

/**
 * Eight 4×16 S-boxes, row-major. FIPS 46-3 prints them as tables; there is no
 * formula that produces them, which is why they are transcribed and then
 * checked against an independent implementation rather than trusted.
 */
const S: ReadonlyArray<ReadonlyArray<number>> = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11,
    9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1, 7, 5,
    11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10,
    6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2,
    11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12,
    11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7, 4,
    15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1,
    10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8, 9,
    4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10,
    3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2, 13, 6,
    15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14,
    0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10,
    11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12,
    2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7, 9,
    5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11,
    0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13,
    15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

const MASK28 = (1n << 28n) - 1n;
const MASK32 = 0xffff_ffffn;

function bit(value: bigint, size: number, pos: number): bigint {
  return (value >> BigInt(size - pos)) & 1n;
}

function permute(value: bigint, size: number, table: readonly number[]): bigint {
  let out = 0n;
  for (const pos of table) out = (out << 1n) | bit(value, size, pos);
  return out;
}

function rot28(value: bigint, n: number): bigint {
  return ((value << BigInt(n)) | (value >> BigInt(28 - n))) & MASK28;
}

function bytesToInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

function intToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return out;
}

function f(r: bigint, subkey: bigint): bigint {
  const mixed = permute(r, 32, E) ^ subkey;
  let sOut = 0n;
  for (let i = 0; i < 8; i++) {
    const six = Number((mixed >> BigInt(42 - 6 * i)) & 0x3fn);
    const row = ((six >> 4) & 0b10) | (six & 1);
    const col = (six >> 1) & 0xf;
    sOut = (sOut << 4n) | BigInt(S[i]![row * 16 + col]!);
  }
  return permute(sOut, 32, P);
}

/** Sixteen 48-bit subkeys, encrypting order. */
export function desSubkeys(key: Uint8Array): bigint[] {
  if (key.length !== 8) throw new Error(`DES needs an 8-byte key; got ${key.length}.`);
  const kd = permute(bytesToInt(key), 64, PC1);
  let c = kd >> 28n;
  let d = kd & MASK28;
  const keys: bigint[] = [];
  for (let i = 0; i < 16; i++) {
    c = rot28(c, ROTATIONS[i]!);
    d = rot28(d, ROTATIONS[i]!);
    keys.push(permute((c << 28n) | d, 56, PC2));
  }
  return keys;
}

function desBlock(block: Uint8Array, keys: readonly bigint[]): Uint8Array {
  if (block.length !== 8) throw new Error(`DES acts on 8-byte blocks; got ${block.length}.`);
  const ip = permute(bytesToInt(block), 64, IP);
  let l = ip >> 32n;
  let r = ip & MASK32;
  for (let i = 0; i < 16; i++) {
    const next = l ^ f(r, keys[i]!);
    l = r;
    r = next;
  }
  // The last round's swap is undone by concatenating R||L, then IP⁻¹.
  return intToBytes(permute((r << 32n) | l, 64, FP), 8);
}

export function encryptDesBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  return desBlock(block, desSubkeys(key));
}

export function decryptDesBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  return desBlock(block, desSubkeys(key).reverse());
}

export function encryptDesEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  return ecbEncrypt((block) => encryptDesBlock(key, block), 8, data);
}

export function decryptDesEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  return ecbDecrypt((block) => decryptDesBlock(key, block), 8, data);
}

export function encryptDesCbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return cbcEncrypt((block) => encryptDesBlock(key, block), 8, iv, data);
}

export function decryptDesCbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return cbcDecrypt((block) => decryptDesBlock(key, block), 8, iv, data);
}

function splitTripleKey(key: Uint8Array): [Uint8Array, Uint8Array, Uint8Array] {
  if (key.length === 16) return [key.subarray(0, 8), key.subarray(8, 16), key.subarray(0, 8)];
  if (key.length === 24) {
    return [key.subarray(0, 8), key.subarray(8, 16), key.subarray(16, 24)];
  }
  throw new Error(`Triple DES needs a 16- or 24-byte key; got ${key.length}.`);
}

export function encryptTripleDesBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  const [k1, k2, k3] = splitTripleKey(key);
  return encryptDesBlock(k3, decryptDesBlock(k2, encryptDesBlock(k1, block)));
}

export function decryptTripleDesBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  const [k1, k2, k3] = splitTripleKey(key);
  return decryptDesBlock(k1, encryptDesBlock(k2, decryptDesBlock(k3, block)));
}

export function encryptTripleDesEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  return ecbEncrypt((block) => encryptTripleDesBlock(key, block), 8, data);
}

export function decryptTripleDesEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  return ecbDecrypt((block) => decryptTripleDesBlock(key, block), 8, data);
}

export function encryptTripleDesCbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return cbcEncrypt((block) => encryptTripleDesBlock(key, block), 8, iv, data);
}

export function decryptTripleDesCbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return cbcDecrypt((block) => decryptTripleDesBlock(key, block), 8, iv, data);
}
