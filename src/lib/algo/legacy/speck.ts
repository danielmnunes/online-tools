/**
 * SPECK-128, written from Beaulieu et al., "The SIMON and SPECK Families of
 * Lightweight Block Ciphers".
 *
 * There is no SPECK in the Web Crypto API or in @noble/ciphers. The round
 * function is two rotations, an addition and two XORs, so the implementation
 * is short; the official test vectors in that paper are what make it checked
 * rather than hoped.
 *
 * Only the 128-bit-block member is here (SPECK-128/128, /192 and /256). The
 * 64-bit-block variants have a different rotation pair and a different round
 * count, and they are not what "SPECK online" searches are looking for.
 */
import { cbcDecrypt, cbcEncrypt, ecbDecrypt, ecbEncrypt } from '../modes';

const MASK64 = (1n << 64n) - 1n;
const ALPHA = 8n;
const BETA = 3n;

function ror(value: bigint, n: bigint): bigint {
  return ((value >> n) | (value << (64n - n))) & MASK64;
}

function rol(value: bigint, n: bigint): bigint {
  return ((value << n) | (value >> (64n - n))) & MASK64;
}

function round(x: bigint, y: bigint, k: bigint): [bigint, bigint] {
  x = (ror(x, ALPHA) + y) & MASK64;
  x ^= k;
  y = rol(y, BETA) ^ x;
  return [x, y];
}

function invRound(x: bigint, y: bigint, k: bigint): [bigint, bigint] {
  y = ror(y ^ x, BETA);
  x = rol(((x ^ k) - y) & MASK64, ALPHA);
  return [x, y];
}

function load64(bytes: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(bytes[offset + i]!);
  return v;
}

function store64(bytes: Uint8Array, offset: number, value: bigint): void {
  for (let i = 7; i >= 0; i--) {
    bytes[offset + i] = Number(value & 0xffn);
    value >>= 8n;
  }
}

/**
 * Round count for SPECK-128 given the number of 64-bit key words.
 * 128/128 → m=2, T=32; 128/192 → m=3, T=33; 128/256 → m=4, T=34.
 */
export function speckRounds(keyWords: number): number {
  if (keyWords === 2) return 32;
  if (keyWords === 3) return 33;
  if (keyWords === 4) return 34;
  throw new Error(`SPECK-128 takes a 16-, 24- or 32-byte key; that is ${keyWords} words.`);
}

function expand(key: Uint8Array): bigint[] {
  if (key.length !== 16 && key.length !== 24 && key.length !== 32) {
    throw new Error(`SPECK-128 needs a 16-, 24- or 32-byte key; got ${key.length}.`);
  }
  const m = key.length / 8;
  const t = speckRounds(m);
  const k: bigint[] = [load64(key, key.length - 8)];
  const l: bigint[] = [];
  for (let i = m - 2; i >= 0; i--) l.push(load64(key, i * 8));

  for (let i = 0; i < t - 1; i++) {
    const [li, ki] = round(l[i]!, k[i]!, BigInt(i));
    l.push(li);
    k.push(ki);
  }
  return k;
}

export function encryptSpeckBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  if (block.length !== 16) throw new Error(`SPECK-128 acts on 16-byte blocks; got ${block.length}.`);
  const keys = expand(key);
  let x = load64(block, 0);
  let y = load64(block, 8);
  for (const roundKey of keys) [x, y] = round(x, y, roundKey);
  const out = new Uint8Array(16);
  store64(out, 0, x);
  store64(out, 8, y);
  return out;
}

export function decryptSpeckBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  if (block.length !== 16) throw new Error(`SPECK-128 acts on 16-byte blocks; got ${block.length}.`);
  const keys = expand(key);
  let x = load64(block, 0);
  let y = load64(block, 8);
  for (let i = keys.length - 1; i >= 0; i--) [x, y] = invRound(x, y, keys[i]!);
  const out = new Uint8Array(16);
  store64(out, 0, x);
  store64(out, 8, y);
  return out;
}

export function encryptSpeckEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  return ecbEncrypt((block) => encryptSpeckBlock(key, block), 16, data);
}

export function decryptSpeckEcb(key: Uint8Array, data: Uint8Array): Uint8Array {
  return ecbDecrypt((block) => decryptSpeckBlock(key, block), 16, data);
}

export function encryptSpeckCbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return cbcEncrypt((block) => encryptSpeckBlock(key, block), 16, iv, data);
}

export function decryptSpeckCbc(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
  return cbcDecrypt((block) => decryptSpeckBlock(key, block), 16, iv, data);
}
