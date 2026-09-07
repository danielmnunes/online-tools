/**
 * SPECK-128 against the official test vectors in Beaulieu et al.
 *
 * Those vectors are the reason a transcribed round count is not a leap of
 * faith: if the key expansion or the rotation pair is off by one, they fail.
 */
import { describe, expect, it } from 'vitest';
import {
  decryptSpeckBlock,
  encryptSpeckBlock,
  encryptSpeckEcb,
  speckRounds,
} from '~/lib/algo/legacy/speck';
import { bytesToHex, hexToBytes } from '~/lib/encoding';

describe('round counts', () => {
  it('are 32/33/34 for 128/192/256-bit keys', () => {
    expect(speckRounds(2)).toBe(32);
    expect(speckRounds(3)).toBe(33);
    expect(speckRounds(4)).toBe(34);
  });
});

describe('Beaulieu et al. test vectors', () => {
  it('SPECK-128/128', () => {
    const key = hexToBytes('0f0e0d0c0b0a09080706050403020100');
    const plain = hexToBytes('6c617669757165207469206564616d20');
    const cipher = hexToBytes('a65d9851797832657860fedf5c570d18');
    expect(bytesToHex(encryptSpeckBlock(key, plain))).toBe(bytesToHex(cipher));
    expect(bytesToHex(decryptSpeckBlock(key, cipher))).toBe(bytesToHex(plain));
  });

  it('SPECK-128/192', () => {
    const key = hexToBytes('17161514131211100f0e0d0c0b0a09080706050403020100');
    const plain = hexToBytes('726148206665696843206f7420746e65');
    const cipher = hexToBytes('1be4cf3a13135566f9bc185de03c1886');
    expect(bytesToHex(encryptSpeckBlock(key, plain))).toBe(bytesToHex(cipher));
    expect(bytesToHex(decryptSpeckBlock(key, cipher))).toBe(bytesToHex(plain));
  });

  it('SPECK-128/256', () => {
    const key = hexToBytes('1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100');
    const plain = hexToBytes('65736f6874206e49202e72656e6f6f70');
    const cipher = hexToBytes('4109010405c0f53e4eeeb48d9c188f43');
    expect(bytesToHex(encryptSpeckBlock(key, plain))).toBe(bytesToHex(cipher));
    expect(bytesToHex(decryptSpeckBlock(key, cipher))).toBe(bytesToHex(plain));
  });
});

describe('ECB of two blocks', () => {
  it('is two independent block encryptions', () => {
    const key = hexToBytes('0f0e0d0c0b0a09080706050403020100');
    const block = hexToBytes('6c61766975716520746f206120736e61');
    const twice = new Uint8Array(32);
    twice.set(block, 0);
    twice.set(block, 16);
    const out = encryptSpeckEcb(key, twice);
    expect(out.subarray(0, 16)).toEqual(out.subarray(16));
  });
});
