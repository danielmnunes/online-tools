/**
 * bcrypt is the one algorithm on this site written from the specification
 * rather than taken from a library, so it gets the heaviest verification.
 *
 * Four layers:
 *  1. The initial state is recomputed from pi and compared word by word, so
 *     the 1042-word table cannot have been mis-transcribed.
 *  2. The published OpenBSD/Openwall vectors, including the ones designed to
 *     catch the 72-byte truncation and the NUL-termination edge.
 *  3. Vectors generated from Bouncy Castle and cross-checked against the
 *     Rust-backed Python `bcrypt` module -- two implementations sharing no
 *     code with this one or with each other.
 *  4. Round-trip properties: parse(format(x)) === x, and verify() agreeing
 *     with hash() over random salts.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_PASSWORD_BYTES,
  bcryptHash,
  bcryptRaw,
  bcryptVerify,
  decodeBase64,
  encodeBase64,
  formatHash,
  parseHash,
} from '~/lib/algo/legacy/bcrypt';
import { INITIAL_STATE } from '~/lib/algo/legacy/blowfish-state';
import { bytesToHex, textToBytes } from '~/lib/encoding';

const utf8 = (text: string) => textToBytes(text, 'utf-8');

/**
 * Hexadecimal digits of pi's fractional part, by Machin's formula:
 *   pi = 16·arctan(1/5) - 4·arctan(1/239)
 * evaluated in scaled integer arithmetic with guard digits.
 */
function piHexDigits(digits: number): string {
  const guard = 32;
  const scale = 16n ** BigInt(digits + guard);
  const arctanInv = (x: number): bigint => {
    const x2 = BigInt(x) * BigInt(x);
    let term = scale / BigInt(x);
    let sum = 0n;
    let n = 0n;
    while (term !== 0n) {
      sum += n % 2n === 0n ? term / (2n * n + 1n) : -(term / (2n * n + 1n));
      term /= x2;
      n += 1n;
    }
    return sum;
  };
  const pi = 16n * arctanInv(5) - 4n * arctanInv(239);
  return ((pi - 3n * scale) / 16n ** BigInt(guard)).toString(16).padStart(digits, '0');
}

describe('Blowfish initial state', () => {
  it('is the hexadecimal fraction of pi, word for word', () => {
    const words = 18 + 4 * 256;
    const hex = piHexDigits(words * 8);
    const expected = Uint32Array.from({ length: words }, (_, i) =>
      Number.parseInt(hex.slice(i * 8, i * 8 + 8), 16),
    );
    expect(INITIAL_STATE.length).toBe(words);
    expect([...INITIAL_STATE]).toEqual([...expected]);
  });

  it('starts with the P-array Schneier published', () => {
    expect([...INITIAL_STATE.slice(0, 4)]).toEqual([0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344]);
    expect(INITIAL_STATE[17]).toBe(0x8979fb1b);
    expect(INITIAL_STATE[18]).toBe(0xd1310ba6);
    expect(INITIAL_STATE[18 + 1023]).toBe(0x3ac372e6);
  });
});

/**
 * The canonical bcrypt test suite, as circulated with OpenBSD and Openwall.
 * The last three are the interesting ones: they differ only past the point
 * where bcrypt stops reading, or exercise the 8-bit and NUL handling.
 */
describe('published bcrypt vectors', () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ['', '$2a$06$DCq7YPn5Rq63x1Lad4cll.TV4S6ytwfsfvkgY8jIucDrjc8deX1s.'],
    ['a', '$2a$06$m0CrhHm10qJ3lXRY.5zDGO3rS2KdeeWLuGmsfGlMfOxih58VYVfxe'],
    ['abc', '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i'],
    ['abcdefghijklmnopqrstuvwxyz', '$2a$06$.rCVZVOThsIa97pEDOxvGuRRgzG64bvtJ0938xuqzv18d3ZpQhstC'],
    [
      '~!@#$%^&*()      ~!@#$%^&*()PNBFRD',
      '$2a$06$fPIsBO8qRqkjj273rfaOI.HtSV9jLDpTbZn782DC6/t7qT67P6FfO',
    ],
    ['U*U', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW'],
    ['U*U*', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.VGOzA784oUp/Z0DY336zx7pLYAy0lwK'],
    ['U*U*U', '$2a$05$XXXXXXXXXXXXXXXXXXXXXOAcXxm9kjPGEMsLznoKqmqw7tc8WCx4a'],
    [
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' +
        'chars after 72 are ignored',
      '$2a$05$abcdefghijklmnopqrstuu5s2v8.iXieOjg/.AySBTTZIIVFJeBui',
    ],
  ];

  it.each(vectors)('hashes %j to the published value', async (password, expected) => {
    const { salt, cost, version } = parseHash(expected);
    expect(await bcryptHash(utf8(password), salt, cost, version)).toBe(expected);
  });

  it.each(vectors)('verifies %j against the published hash', async (password, expected) => {
    expect((await bcryptVerify(utf8(password), expected)).matches).toBe(true);
  });
});

/**
 * Generated with Bouncy Castle 1.83 (OpenBSDBCrypt.generate) and independently
 * confirmed with the Python `bcrypt` 5.0 module, which wraps a Rust
 * implementation. Salts are chosen for their edges: all zero bytes, all 0xff,
 * and a deterministic ramp.
 */
describe('parity with Bouncy Castle and python-bcrypt', () => {
  const seq = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);
  const SALTS: Record<string, Uint8Array> = {
    zeros: new Uint8Array(16),
    ramp: seq(16),
    ones: new Uint8Array(16).fill(0xff),
  };

  const vectors: ReadonlyArray<[number, string, string, string]> = [
    [4, 'zeros', '', '$2a$04$......................w74bL5gU7LSJClZClCa.Pkz14aTv/XO'],
    [5, 'zeros', 'password', '$2a$05$......................4kZsVIu25gd2IicO3oMXwuxg.rWdRZG'],
    [
      6,
      'ramp',
      'correct horse battery staple',
      '$2a$06$Ax/Tcn9C4O2xUF0gv8uPLeRRtk/QqDiF6Ucnw2a8iVE1EqbiMMKgC',
    ],
    [8, 'ramp', 'abc', '$2a$08$Ax/Tcn9C4O2xUF0gv8uPLeljHWRB6dfMvcY77/xRHEIS5fRfrKXzm'],
    [
      5,
      'ones',
      'áéí óú unicode',
      '$2a$05$999999999999999999999uabPLF6oPN3YOytgVcTzH3za9hXU5zfe',
    ],
    [
      5,
      'ramp',
      '0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '$2a$05$Ax/Tcn9C4O2xUF0gv8uPLeoQhvvMDXWWzwpRNOkqoEBcbT4dM3A/O',
    ],
  ];

  it.each(vectors)('cost %i, %s salt, %j', async (cost, saltName, password, expected) => {
    expect(await bcryptHash(utf8(password), SALTS[saltName]!, cost)).toBe(expected);
  });
});

describe('the 72-byte limit', () => {
  const salt = Uint8Array.from({ length: 16 }, (_, i) => i);

  it('ignores everything past 72 bytes', async () => {
    const base = 'x'.repeat(MAX_PASSWORD_BYTES);
    const a = await bcryptHash(utf8(base + 'first tail'), salt, 4);
    const b = await bcryptHash(utf8(base + 'a completely different tail'), salt, 4);
    expect(a).toBe(b);
  });

  it('still distinguishes passwords that differ inside the limit', async () => {
    const a = await bcryptHash(utf8('x'.repeat(71) + 'a'), salt, 4);
    const b = await bcryptHash(utf8('x'.repeat(71) + 'b'), salt, 4);
    expect(a).not.toBe(b);
  });

  it('counts bytes rather than characters', async () => {
    // Three-byte characters: 24 of them reach the limit exactly.
    const a = await bcryptHash(utf8('€'.repeat(24)), salt, 4);
    const b = await bcryptHash(utf8('€'.repeat(24) + '€'), salt, 4);
    expect(a).toBe(b);
  });
});

describe('the encoded form', () => {
  it('round-trips through parse and format', () => {
    const hash = '$2b$12$Ax/Tcn9C4O2xUF0gv8uPLeRRtk/QqDiF6Ucnw2a8iVE1EqbiMMKgC';
    expect(formatHash(parseHash(hash))).toBe(hash);
  });

  it('reads the version, cost and salt out', () => {
    const parsed = parseHash('$2y$07$......................w74bL5gU7LSJClZClCa.Pkz14aTv/XO');
    expect(parsed.version).toBe('2y');
    expect(parsed.cost).toBe(7);
    expect(bytesToHex(parsed.salt)).toBe('00'.repeat(16));
  });

  it.each([
    ['', 'Not a bcrypt hash'],
    ['$2a$10$tooshort', 'Not a bcrypt hash'],
    ['$2c$10$......................w74bL5gU7LSJClZClCa.Pkz14aTv/XO', 'Not a bcrypt hash'],
    ['$2a$99$......................w74bL5gU7LSJClZClCa.Pkz14aTv/XO', 'cost must be'],
  ])('rejects %j', (bad, message) => {
    expect(() => parseHash(bad)).toThrow(new RegExp(message, 'i'));
  });

  it('round-trips arbitrary bytes through the bcrypt alphabet', () => {
    const bytes = Uint8Array.from({ length: 23 }, (_, i) => (i * 91 + 7) & 0xff);
    expect(bytesToHex(decodeBase64(encodeBase64(bytes, 23), 23))).toBe(bytesToHex(bytes));
  });
});

describe('verification', () => {
  it('accepts the right password and rejects the rest', async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, i) => (i * 5) & 0xff);
    const stored = await bcryptHash(utf8('correct'), salt, 4);

    expect((await bcryptVerify(utf8('correct'), stored)).matches).toBe(true);
    expect((await bcryptVerify(utf8('Correct'), stored)).matches).toBe(false);
    expect((await bcryptVerify(utf8(''), stored)).matches).toBe(false);
  });

  it('reports the parameters it read from the hash', async () => {
    const { hash } = await bcryptVerify(
      utf8('a'),
      '$2a$06$m0CrhHm10qJ3lXRY.5zDGO3rS2KdeeWLuGmsfGlMfOxih58VYVfxe',
    );
    expect(hash.cost).toBe(6);
    expect(hash.version).toBe('2a');
  });
});

describe('parameter validation', () => {
  it.each([3, 32, 4.5])('rejects a cost of %s', async (cost) => {
    await expect(bcryptRaw(utf8('x'), new Uint8Array(16), cost)).rejects.toThrow(/cost/i);
  });

  it('insists on a 16-byte salt', async () => {
    await expect(bcryptRaw(utf8('x'), new Uint8Array(8), 4)).rejects.toThrow(/16-byte salt/);
  });
});

describe('progress and cancellation', () => {
  it('reports progress ending at 1', async () => {
    const seen: number[] = [];
    await bcryptRaw(utf8('x'), new Uint8Array(16), 6, { onProgress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('honours an abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      bcryptRaw(utf8('x'), new Uint8Array(16), 6, { signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
  });
});
