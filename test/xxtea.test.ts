/**
 * XXTEA: the delta is derived from φ, and the cipher is checked against a
 * second copy of the MX step written in the test, plus a round-trip.
 */
import { describe, expect, it } from 'vitest';
import { DELTA, decryptXxtea, encryptXxtea } from '~/lib/algo/legacy/xxtea';
import { hexToBytes } from '~/lib/encoding';

describe('the round constant', () => {
  it('is floor(2^32 / φ), derived from the golden ratio rather than copied', () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    expect(DELTA).toBe(Math.floor(2 ** 32 / phi) >>> 0);
    expect(DELTA).toBe(0x9e3779b9);
  });
});

/**
 * A second copy of MX, written from the 2010 correction of btea(), so a
 * transcription error in the implementation is a disagreement with this, not
 * a silent agreement with itself.
 */
function reference(key: Uint8Array, data: Uint8Array, encrypt: boolean): Uint8Array {
  const n = data.length / 4;
  const v = new Uint32Array(n);
  const k = new Uint32Array(4);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const keyView = new DataView(key.buffer, key.byteOffset, key.byteLength);
  for (let i = 0; i < n; i++) v[i] = view.getUint32(i * 4, true);
  for (let i = 0; i < 4; i++) k[i] = keyView.getUint32(i * 4, true);

  const mx = (z: number, y: number, sum: number, p: number, e: number): number =>
    (((((z >>> 5) ^ (y << 2)) + ((y >>> 3) ^ (z << 4))) ^ ((sum ^ y) + (k[(p & 3) ^ e]! ^ z))) >>>
      0);

  const rounds = 6 + Math.floor(52 / n);
  if (encrypt) {
    let z = v[n - 1]!;
    let sum = 0;
    for (let r = 0; r < rounds; r++) {
      sum = (sum + DELTA) >>> 0;
      const e = (sum >>> 2) & 3;
      for (let p = 0; p < n; p++) {
        const y = v[(p + 1) % n]!;
        z = v[p] = (v[p]! + mx(z, y, sum, p, e)) >>> 0;
      }
    }
  } else {
    let y = v[0]!;
    let sum = Math.imul(rounds, DELTA) >>> 0;
    for (let r = 0; r < rounds; r++) {
      const e = (sum >>> 2) & 3;
      for (let p = n - 1; p >= 0; p--) {
        const z = v[(p + n - 1) % n]!;
        y = v[p] = (v[p]! - mx(z, y, sum, p, e)) >>> 0;
      }
      sum = (sum - DELTA) >>> 0;
    }
  }

  const out = new Uint8Array(data.length);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < n; i++) outView.setUint32(i * 4, v[i]!, true);
  return out;
}

describe('XXTEA', () => {
  it('agrees with the reference MX on a two-word block', () => {
    const key = hexToBytes('000102030405060708090a0b0c0d0e0f');
    const data = hexToBytes('0011223344556677');
    expect(encryptXxtea(key, data)).toEqual(reference(key, data, true));
  });

  it('round-trips messages from 8 to 64 bytes', () => {
    const key = hexToBytes('00112233445566778899aabbccddeeff');
    for (const length of [8, 12, 16, 20, 32, 64]) {
      const data = new Uint8Array(length);
      for (let i = 0; i < length; i++) data[i] = (i * 17) & 0xff;
      expect(decryptXxtea(key, encryptXxtea(key, data))).toEqual(data);
    }
  });
});
