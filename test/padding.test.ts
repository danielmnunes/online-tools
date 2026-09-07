import { describe, expect, it } from 'vitest';
import { pad, padLength, unpad } from '~/lib/algo/padding';

describe('PKCS#7', () => {
  it('always adds at least one byte, so an aligned input grows by a block', () => {
    expect(padLength(8, 8, 'pkcs7')).toBe(8);
    const padded = pad(new Uint8Array(8), 8, 'pkcs7');
    expect(padded).toHaveLength(16);
    expect([...padded.subarray(8)]).toEqual(Array(8).fill(8));
    expect(unpad(padded, 8, 'pkcs7')).toEqual(new Uint8Array(8));
  });

  it('round-trips a short block', () => {
    const data = Uint8Array.of(1, 2, 3);
    expect(unpad(pad(data, 8, 'pkcs7'), 8, 'pkcs7')).toEqual(data);
  });

  it('rejects a padding byte that does not match the length', () => {
    expect(() => unpad(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 3), 8, 'pkcs7')).toThrow(/PKCS#7/);
  });
});

describe('ANSI X.923', () => {
  it('writes zeros then the length', () => {
    const padded = pad(Uint8Array.of(1, 2, 3), 8, 'ansix923');
    expect([...padded]).toEqual([1, 2, 3, 0, 0, 0, 0, 5]);
    expect(unpad(padded, 8, 'ansix923')).toEqual(Uint8Array.of(1, 2, 3));
  });
});

describe('ISO/IEC 7816-4', () => {
  it('writes 0x80 then zeros', () => {
    const padded = pad(Uint8Array.of(1, 2, 3), 8, 'iso7816');
    expect([...padded]).toEqual([1, 2, 3, 0x80, 0, 0, 0, 0]);
    expect(unpad(padded, 8, 'iso7816')).toEqual(Uint8Array.of(1, 2, 3));
  });
});

describe('zero padding', () => {
  it('does not grow an already-aligned input', () => {
    const data = new Uint8Array(8).fill(1);
    expect(pad(data, 8, 'zero')).toEqual(data);
  });

  it('strips trailing zeros, which is lossy by design', () => {
    expect([...unpad(Uint8Array.of(1, 2, 0, 0), 4, 'zero')]).toEqual([1, 2]);
  });
});

describe('none', () => {
  it('refuses a length that is not a multiple of the block', () => {
    expect(() => pad(Uint8Array.of(1), 8, 'none')).toThrow(/multiple/);
  });
});
