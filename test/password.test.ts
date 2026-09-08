/**
 * Password generation.
 *
 * The interesting properties are uniformity of the draw (rejection sampling
 * rather than `byte % n`), membership of the requested alphabet, and that
 * Math.random is never consulted.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHARSETS,
  alphabetFor,
  entropyBits,
  generatePassword,
  randomInt,
} from '~/lib/password';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('randomInt', () => {
  it('stays in range', () => {
    for (let i = 0; i < 200; i++) {
      const n = randomInt(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    }
  });

  it('draws from crypto.getRandomValues, never Math.random', () => {
    const math = vi.spyOn(Math, 'random');
    const cryptoSpy = vi.spyOn(crypto, 'getRandomValues');
    randomInt(10);
    expect(math).not.toHaveBeenCalled();
    expect(cryptoSpy).toHaveBeenCalled();
  });
});

describe('generatePassword', () => {
  it('has the requested length and stays in the alphabet', () => {
    const alphabet = alphabetFor({ length: 20, sets: ['lower', 'digits'] });
    const password = generatePassword({ length: 20, sets: ['lower', 'digits'], requireEverySet: false });
    expect(password).toHaveLength(20);
    for (const ch of password) expect(alphabet).toContain(ch);
  });

  it('includes at least one character from each selected set', () => {
    for (let i = 0; i < 20; i++) {
      const password = generatePassword({
        length: 8,
        sets: ['lower', 'upper', 'digits'],
        requireEverySet: true,
      });
      expect([...CHARSETS.lower].some((ch) => password.includes(ch))).toBe(true);
      expect([...CHARSETS.upper].some((ch) => password.includes(ch))).toBe(true);
      expect([...CHARSETS.digits].some((ch) => password.includes(ch))).toBe(true);
    }
  });

  it('drops ambiguous characters when asked', () => {
    const password = generatePassword({
      length: 40,
      sets: ['upper', 'digits'],
      excludeAmbiguous: true,
      requireEverySet: false,
    });
    expect(password).not.toMatch(/[0OIl1]/);
  });

  it('refuses an empty alphabet', () => {
    expect(() => generatePassword({ length: 8, sets: [] })).toThrow(/character set/);
  });

  it('never calls Math.random', () => {
    const math = vi.spyOn(Math, 'random');
    generatePassword({ length: 16, sets: ['lower', 'upper', 'digits', 'symbols'] });
    expect(math).not.toHaveBeenCalled();
  });
});

describe('entropyBits', () => {
  it('is length × log2(alphabet)', () => {
    expect(entropyBits(20, 72)).toBeCloseTo(20 * Math.log2(72));
    expect(entropyBits(0, 72)).toBe(0);
  });
});
