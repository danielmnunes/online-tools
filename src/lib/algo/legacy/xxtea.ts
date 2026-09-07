/**
 * XXTEA (Corrected Block TEA), written from Needham and Wheeler's 1998 note
 * and the 2010 correction of the original C.
 *
 * There is no XXTEA in the Web Crypto API or in @noble/ciphers. The round
 * constant is not transcribed: it is floor(2^32 / φ), the same nothing-up-
 * my-sleeve value TEA used, derived here from the golden ratio. The rest of
 * the cipher is a handful of shifts and the MX mixing step, checked against
 * a second copy of that formula inside the tests.
 *
 * The algorithm runs on a whole message of n 32-bit words, n ≥ 2, under a
 * 128-bit key. Words are little-endian, which is what the original C did.
 */

/**
 * floor(2^32 / φ), φ = (1 + √5) / 2.
 *
 * Equal to 0x9e3779b9. Derived rather than written down, for the same reason
 * bcrypt's P-array is derived from pi: a transcribed constant is a copy
 * error waiting to happen, and this one has a closed form.
 */
export const DELTA = Math.floor((2 ** 32 * (Math.sqrt(5) - 1)) / 2) >>> 0;

function mx(z: number, y: number, sum: number, k: Uint32Array, p: number, e: number): number {
  return (
    ((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (k[(p & 3) ^ e]! ^ z))) >>> 0
  );
}

function toWords(data: Uint8Array): Uint32Array {
  if (data.length < 8 || data.length % 4 !== 0) {
    throw new Error(
      `XXTEA needs at least 8 bytes and a multiple of 4; got ${data.length}. ` +
        'Pad the input, or pass bytes that are already aligned.',
    );
  }
  const words = new Uint32Array(data.length / 4);
  for (let i = 0; i < words.length; i++) {
    const o = i * 4;
    words[i] = data[o]! | (data[o + 1]! << 8) | (data[o + 2]! << 16) | (data[o + 3]! << 24);
  }
  return words;
}

function fromWords(words: Uint32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const o = i * 4;
    out[o] = w & 0xff;
    out[o + 1] = (w >>> 8) & 0xff;
    out[o + 2] = (w >>> 16) & 0xff;
    out[o + 3] = (w >>> 24) & 0xff;
  }
  return out;
}

function keyWords(key: Uint8Array): Uint32Array {
  if (key.length !== 16) throw new Error(`XXTEA needs a 16-byte key; got ${key.length}.`);
  return toWords(key);
}

export function encryptXxtea(key: Uint8Array, data: Uint8Array): Uint8Array {
  const v = toWords(data);
  const k = keyWords(key);
  const n = v.length;
  const rounds = 6 + Math.floor(52 / n);
  let z = v[n - 1]!;
  let sum = 0;
  for (let r = 0; r < rounds; r++) {
    sum = (sum + DELTA) >>> 0;
    const e = (sum >>> 2) & 3;
    for (let p = 0; p < n - 1; p++) {
      const y = v[p + 1]!;
      z = v[p] = (v[p]! + mx(z, y, sum, k, p, e)) >>> 0;
    }
    const y = v[0]!;
    z = v[n - 1] = (v[n - 1]! + mx(z, y, sum, k, n - 1, e)) >>> 0;
  }
  return fromWords(v);
}

export function decryptXxtea(key: Uint8Array, data: Uint8Array): Uint8Array {
  const v = toWords(data);
  const k = keyWords(key);
  const n = v.length;
  const rounds = 6 + Math.floor(52 / n);
  let y = v[0]!;
  let sum = Math.imul(rounds, DELTA) >>> 0;
  for (let r = 0; r < rounds; r++) {
    const e = (sum >>> 2) & 3;
    for (let p = n - 1; p > 0; p--) {
      const z = v[p - 1]!;
      y = v[p] = (v[p]! - mx(z, y, sum, k, p, e)) >>> 0;
    }
    const z = v[n - 1]!;
    y = v[0] = (v[0]! - mx(z, y, sum, k, 0, e)) >>> 0;
    sum = (sum - DELTA) >>> 0;
  }
  return fromWords(v);
}
