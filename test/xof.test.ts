/**
 * The extendable-output and Keccak-MAC functions.
 *
 * Four layers, in increasing order of how much they would catch:
 *
 *  1. SHAKE against OpenSSL through node:crypto, over a spread of input and
 *     output lengths -- a live oracle, not a fixed table.
 *  2. The SP 800-185 vectors in test/vectors/sp800-185.ts, which are Bouncy
 *     Castle's and agree with the NIST samples and with OpenSSL's KMAC.
 *  3. TupleHash and ParallelHash re-derived from the specification text, on
 *     top of OpenSSL's SHAKE, at arbitrary parameters rather than the ones a
 *     vector table happens to cover. This is the layer that caught a real bug
 *     in Bouncy Castle, so it earns its keep.
 *  4. The identities and separations the specification promises: cSHAKE with
 *     no strings is SHAKE, the XOF forms are prefix-consistent and the others
 *     are not, and a tuple cannot be forged by moving a byte between elements.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStreamingXof, resolveParams, xofBlob, xofBytes } from '~/lib/algo/xof';
import { XOFS, XOF_IDS, type XofId } from '~/lib/algo/xofs';
import { bytesToHex, textToBytes } from '~/lib/encoding';
import {
  CSHAKE_VECTORS,
  KMAC_VECTORS,
  PARALLELHASH_VECTORS,
  TUPLEHASH_VECTORS,
} from './vectors/sp800-185';

const utf8 = (text: string) => textToBytes(text, 'utf-8');
const hexb = (hex: string) => textToBytes(hex, 'hex');
const seq = (n: number): Uint8Array<ArrayBuffer> =>
  Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);

/** The named inputs the vector table refers to. */
const INPUTS: Readonly<Record<string, Uint8Array>> = {
  // The two message inputs the SP 800-185 samples use.
  nist4: Uint8Array.from([0, 1, 2, 3]),
  nist200: Uint8Array.from({ length: 200 }, (_, i) => i),
  key32: Uint8Array.from({ length: 32 }, (_, i) => 0x40 + i),
  p1: hexb('000102030405060710111213141516172021222324252627'),
  seq0: seq(0),
  seq1: seq(1),
  seq135: seq(135),
  seq136: seq(136),
  seq167: seq(167),
  seq168: seq(168),
  seq333: seq(333),
  seq500: seq(500),
  seq1000: seq(1000),
};

const TUPLES: Readonly<Record<string, Uint8Array[]>> = {
  t1: [hexb('000102'), hexb('101112131415')],
  t2: [hexb('000102'), hexb('101112131415'), hexb('202122232425262728')],
  t3: [seq(0), seq(1), seq(200)],
};

function input(name: string): Uint8Array {
  const bytes = INPUTS[name];
  if (bytes === undefined) throw new Error(`No input named ${name}.`);
  return bytes;
}

/** Optional string parameters: empty means absent, as SP 800-185 defines it. */
function optional(text: string): Uint8Array | undefined {
  return text === '' ? undefined : utf8(text);
}

/**
 * Parameters a given function will actually accept.
 *
 * The dispatcher rejects anything an algorithm has no slot for, which is the
 * behaviour under test elsewhere; here it means a test that sweeps the whole
 * catalogue has to ask the table what each one takes.
 */
function paramsFor(id: XofId, dkLen?: number) {
  const meta = XOFS[id];
  return {
    ...(dkLen !== undefined ? { dkLen } : {}),
    ...(meta.key === 'required' ? { key: utf8('a key') } : {}),
    ...(meta.customization ? { customization: utf8('S') } : {}),
    ...(meta.blockLen !== undefined ? { blockLen: meta.blockLen.default } : {}),
  };
}

const shake = (bits: 128 | 256, data: Uint8Array, dkLen: number): string =>
  createHash(`shake${bits}`, { outputLength: dkLen })
    .update(Buffer.from(data))
    .digest('hex');

describe('SHAKE matches OpenSSL', () => {
  // Lengths on and around the SHAKE rates: 168 bytes for SHAKE128, 136 for
  // SHAKE256. Padding bugs live on those boundaries.
  const LENGTHS = [0, 1, 63, 64, 135, 136, 137, 167, 168, 169, 200, 1000, 4096];

  it.each(LENGTHS)('SHAKE128 of a %i-byte input', async (length) => {
    const data = seq(length);
    expect(bytesToHex(await xofBytes('shake128', [data]))).toBe(shake(128, data, 32));
  });

  it.each(LENGTHS)('SHAKE256 of a %i-byte input', async (length) => {
    const data = seq(length);
    expect(bytesToHex(await xofBytes('shake256', [data]))).toBe(shake(256, data, 64));
  });

  it.each([1, 15, 31, 32, 33, 64, 200, 1000])('SHAKE128 producing %i bytes', async (dkLen) => {
    const data = seq(100);
    expect(bytesToHex(await xofBytes('shake128', [data], { dkLen }))).toBe(shake(128, data, dkLen));
  });

  it.each([1, 15, 31, 32, 33, 64, 200, 1000])('SHAKE256 producing %i bytes', async (dkLen) => {
    const data = seq(100);
    expect(bytesToHex(await xofBytes('shake256', [data], { dkLen }))).toBe(shake(256, data, dkLen));
  });
});

describe('cSHAKE', () => {
  it.each(CSHAKE_VECTORS)(
    'cSHAKE$bits, message $message, N $functionName, S $customization, $dkLen bytes',
    async ({ bits, message, functionName, customization, dkLen, expected }) => {
      const digest = await xofBytes(`cshake${bits}` as XofId, [input(message)], {
        dkLen,
        ...(optional(functionName) !== undefined ? { functionName: utf8(functionName) } : {}),
        ...(optional(customization) !== undefined ? { customization: utf8(customization) } : {}),
      });
      expect(bytesToHex(digest)).toBe(expected);
    },
  );

  /**
   * SP 800-185 section 3.3: with N and S both empty, cSHAKE is defined to be
   * SHAKE. That makes OpenSSL an oracle for cSHAKE's whole padding path at
   * arbitrary lengths, not just the four sample values.
   */
  it.each([0, 1, 135, 136, 167, 168, 500])(
    'with no strings is SHAKE, at %i bytes of input',
    async (length) => {
      const data = seq(length);
      expect(bytesToHex(await xofBytes('cshake128', [data], { dkLen: 32 }))).toBe(
        shake(128, data, 32),
      );
      expect(bytesToHex(await xofBytes('cshake256', [data], { dkLen: 64 }))).toBe(
        shake(256, data, 64),
      );
    },
  );

  it('is not SHAKE once a customization string is given', async () => {
    const data = seq(64);
    const plain = bytesToHex(await xofBytes('cshake128', [data], { dkLen: 32 }));
    const tagged = bytesToHex(
      await xofBytes('cshake128', [data], { dkLen: 32, customization: utf8('x') }),
    );
    expect(tagged).not.toBe(plain);
  });

  it('separates the function name from the customization string', async () => {
    const data = seq(8);
    const asName = await xofBytes('cshake128', [data], { dkLen: 32, functionName: utf8('ab') });
    const asCustom = await xofBytes('cshake128', [data], { dkLen: 32, customization: utf8('ab') });
    expect(bytesToHex(asName)).not.toBe(bytesToHex(asCustom));
  });
});

describe('KMAC', () => {
  it.each(KMAC_VECTORS)(
    'KMAC$bits xof=$xof, key $key, message $message, S $customization, $dkLen bytes',
    async ({ bits, key, message, customization, dkLen, xof, expected }) => {
      const id = (xof ? `kmacxof${bits}` : `kmac${bits}`) as XofId;
      const digest = await xofBytes(id, [input(message)], {
        key: input(key),
        dkLen,
        ...(optional(customization) !== undefined ? { customization: utf8(customization) } : {}),
      });
      expect(bytesToHex(digest)).toBe(expected);
    },
  );

  it('gives a different tag for a different key', async () => {
    const message = seq(50);
    const a = await xofBytes('kmac128', [message], { key: utf8('key one') });
    const b = await xofBytes('kmac128', [message], { key: utf8('key two') });
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });
});

describe('TupleHash', () => {
  it.each(TUPLEHASH_VECTORS)(
    'TupleHash$bits xof=$xof, tuple $tuple, S $customization, $dkLen bytes',
    async ({ bits, tuple, customization, dkLen, xof, expected }) => {
      const id = (xof ? `tuplehashxof${bits}` : `tuplehash${bits}`) as XofId;
      const digest = await xofBytes(id, TUPLES[tuple]!, {
        dkLen,
        ...(optional(customization) !== undefined ? { customization: utf8(customization) } : {}),
      });
      expect(bytesToHex(digest)).toBe(expected);
    },
  );

  /**
   * The property TupleHash exists for. Concatenating first and hashing after
   * cannot tell these apart; TupleHash must.
   */
  it('distinguishes ["ab", "cd"] from ["a", "bcd"]', async () => {
    const first = await xofBytes('tuplehash128', [utf8('ab'), utf8('cd')]);
    const second = await xofBytes('tuplehash128', [utf8('a'), utf8('bcd')]);
    expect(bytesToHex(first)).not.toBe(bytesToHex(second));
  });

  it('distinguishes a one-element tuple from two empty-separated ones', async () => {
    const one = await xofBytes('tuplehash256', [utf8('abc')]);
    const two = await xofBytes('tuplehash256', [utf8('abc'), new Uint8Array(0)]);
    expect(bytesToHex(one)).not.toBe(bytesToHex(two));
  });
});

describe('ParallelHash', () => {
  it.each(PARALLELHASH_VECTORS)(
    'ParallelHash$bits xof=$xof, message $message, B=$blockLen, $dkLen bytes',
    async ({ bits, message, customization, blockLen, dkLen, xof, expected }) => {
      const id = (xof ? `parallelhashxof${bits}` : `parallelhash${bits}`) as XofId;
      const digest = await xofBytes(id, [input(message)], {
        dkLen,
        blockLen,
        ...(optional(customization) !== undefined ? { customization: utf8(customization) } : {}),
      });
      expect(bytesToHex(digest)).toBe(expected);
    },
  );

  it('treats the block size as part of the digest, not a tuning knob', async () => {
    const data = seq(64);
    const eight = await xofBytes('parallelhash128', [data], { blockLen: 8 });
    const sixteen = await xofBytes('parallelhash128', [data], { blockLen: 16 });
    expect(bytesToHex(eight)).not.toBe(bytesToHex(sixteen));
  });
});

/**
 * SP 800-185 written out.
 *
 * left_encode, right_encode and encode_string are section 2.3; TupleHash is
 * 5.1 and ParallelHash is 6.1 and 6.2. The leaf hashes are cSHAKE with both
 * strings empty, which is SHAKE, so OpenSSL supplies them; only the outer
 * call needs a real cSHAKE, and cSHAKE is verified above.
 *
 * This covers parameter combinations no vector table does, and it is what
 * settled a disagreement between two implementations over how a non-default
 * output length is encoded.
 */
describe('re-derived from SP 800-185', () => {
  function encodeNumber(x: number): number[] {
    const bytes: number[] = [];
    let value = x;
    if (value === 0) bytes.push(0);
    while (value > 0) {
      bytes.unshift(value & 0xff);
      value = Math.floor(value / 256);
    }
    return bytes;
  }

  const leftEncode = (x: number) => Uint8Array.from([encodeNumber(x).length, ...encodeNumber(x)]);
  const rightEncode = (x: number) => Uint8Array.from([...encodeNumber(x), encodeNumber(x).length]);

  function concat(...parts: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let at = 0;
    for (const part of parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }

  const encodeString = (s: Uint8Array<ArrayBuffer>) => concat(leftEncode(s.length * 8), s);

  const shakeBytes = (bits: 128 | 256, data: Uint8Array, dkLen: number): Uint8Array<ArrayBuffer> =>
    Uint8Array.from(
      createHash(`shake${bits}`, { outputLength: dkLen }).update(Buffer.from(data)).digest(),
    );

  /** cSHAKE(z, L, N, S), with the site's own cSHAKE as the outer primitive. */
  const outer = (bits: 128 | 256, z: Uint8Array, dkLen: number, fn: string, s: Uint8Array) =>
    xofBytes(`cshake${bits}` as XofId, [z], {
      dkLen,
      functionName: utf8(fn),
      ...(s.length > 0 ? { customization: s } : {}),
    });

  /** SP 800-185 section 5.1 and 5.2. */
  async function tupleHash(
    bits: 128 | 256,
    parts: Uint8Array<ArrayBuffer>[],
    dkLen: number,
    s: Uint8Array,
    xof: boolean,
  ): Promise<Uint8Array> {
    const z = concat(...parts.map(encodeString), rightEncode(xof ? 0 : dkLen * 8));
    return outer(bits, z, dkLen, 'TupleHash', s);
  }

  /** SP 800-185 section 6.1 and 6.2. */
  async function parallelHash(
    bits: 128 | 256,
    message: Uint8Array<ArrayBuffer>,
    blockLen: number,
    dkLen: number,
    s: Uint8Array,
    xof: boolean,
  ): Promise<Uint8Array> {
    const leafLen = bits === 128 ? 32 : 64;
    const blocks = Math.ceil(message.length / blockLen);
    const parts: Uint8Array<ArrayBuffer>[] = [leftEncode(blockLen)];
    for (let i = 0; i < blocks; i++) {
      const block = message.subarray(i * blockLen, Math.min((i + 1) * blockLen, message.length));
      parts.push(shakeBytes(bits, block, leafLen));
    }
    parts.push(rightEncode(blocks), rightEncode(xof ? 0 : dkLen * 8));
    return outer(bits, concat(...parts), dkLen, 'ParallelHash', s);
  }

  const BITS = [128, 256] as const;

  it.each(
    BITS.flatMap((bits) =>
      [1, 8, 32, 40, 64, 100].map((dkLen) => [bits, dkLen] as [128 | 256, number]),
    ),
  )('TupleHash%i producing %i bytes', async (bits, dkLen) => {
    const parts = [seq(3), seq(17), seq(200)];
    const s = utf8('customized');
    for (const xof of [false, true]) {
      const id = (xof ? `tuplehashxof${bits}` : `tuplehash${bits}`) as XofId;
      const mine = await xofBytes(id, parts, { dkLen, customization: s });
      expect(bytesToHex(mine), `xof=${xof}`).toBe(
        bytesToHex(await tupleHash(bits, parts, dkLen, s, xof)),
      );
    }
  });

  it.each(
    BITS.flatMap((bits) =>
      [1, 8, 16, 137].map((blockLen) => [bits, blockLen] as [128 | 256, number]),
    ),
  )('ParallelHash%i with B=%i', async (bits, blockLen) => {
    const message = seq(333);
    const s = utf8('Parallel Data');
    // 40 is deliberately not either variant's default length: that is where
    // the two implementations that disagreed disagreed.
    for (const dkLen of [32, 40, 64]) {
      for (const xof of [false, true]) {
        const id = (xof ? `parallelhashxof${bits}` : `parallelhash${bits}`) as XofId;
        const mine = await xofBytes(id, [message], { dkLen, blockLen, customization: s });
        expect(bytesToHex(mine), `dkLen=${dkLen} xof=${xof}`).toBe(
          bytesToHex(await parallelHash(bits, message, blockLen, dkLen, s, xof)),
        );
      }
    }
  });
});

/**
 * The distinction the metadata table calls `squeezes`, and the reason both
 * forms of each function get their own page.
 */
describe('XOF and non-XOF forms', () => {
  const PAIRS: ReadonlyArray<[XofId, XofId]> = [
    ['kmac128', 'kmacxof128'],
    ['kmac256', 'kmacxof256'],
    ['tuplehash128', 'tuplehashxof128'],
    ['parallelhash256', 'parallelhashxof256'],
  ];

  it.each(PAIRS)('%s and %s disagree', async (fixed, squeezing) => {
    const a = await xofBytes(fixed, [seq(20)], paramsFor(fixed, 32));
    const b = await xofBytes(squeezing, [seq(20)], paramsFor(squeezing, 32));
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it.each(XOF_IDS.filter((id) => XOFS[id].squeezes))(
    '%s gives a short output that is the prefix of a long one',
    async (id) => {
      const short = await xofBytes(id, [seq(20)], paramsFor(id, 16));
      const long = await xofBytes(id, [seq(20)], paramsFor(id, 64));
      expect(bytesToHex(long).startsWith(bytesToHex(short))).toBe(true);
    },
  );

  it.each(XOF_IDS.filter((id) => !XOFS[id].squeezes))(
    '%s commits to its length, so a short output is not a prefix',
    async (id) => {
      const short = await xofBytes(id, [seq(20)], paramsFor(id, 16));
      const long = await xofBytes(id, [seq(20)], paramsFor(id, 64));
      expect(bytesToHex(long).startsWith(bytesToHex(short))).toBe(false);
    },
  );
});

describe('streaming', () => {
  const STREAMABLE: ReadonlyArray<XofId> = [
    'shake128',
    'shake256',
    'cshake128',
    'cshake256',
    'kmac128',
    'kmac256',
  ];

  it.each(STREAMABLE)('%s streamed in pieces equals the one-shot value', async (id) => {
    const data = seq(700_000);
    const params = paramsFor(id, 40);

    const hasher = await createStreamingXof(id, params);
    for (let at = 0; at < data.length; at += 100_003) {
      hasher.update(data.subarray(at, Math.min(at + 100_003, data.length)));
    }
    expect(bytesToHex(hasher.digest())).toBe(bytesToHex(await xofBytes(id, [data], params)));
  });

  it.each(STREAMABLE)('%s over a Blob equals the one-shot value', async (id) => {
    const data = seq(500_000);
    const params = paramsFor(id, 40);
    expect(bytesToHex(await xofBlob(id, new Blob([data]), params))).toBe(
      bytesToHex(await xofBytes(id, [data], params)),
    );
  });

  it('reports progress that ends at 1', async () => {
    const seen: number[] = [];
    await xofBlob('shake128', new Blob([seq(500_000)]), { onProgress: (f) => seen.push(f) });
    expect(seen.at(-1)).toBe(1);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  it('honours an abort signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      xofBlob('shake256', new Blob([seq(1000)]), { signal: controller.signal }),
    ).rejects.toThrow(/cancelled/i);
  });

  it('refuses to stream the functions that cannot be streamed', async () => {
    for (const id of ['tuplehash128', 'parallelhash256'] as XofId[]) {
      await expect(createStreamingXof(id, {})).rejects.toThrow(/cannot be computed incrementally/);
    }
  });
});

describe('parameter validation', () => {
  it('refuses a key where the function takes none', async () => {
    await expect(xofBytes('shake128', [seq(1)], { key: utf8('k') })).rejects.toThrow(
      /does not take a key/,
    );
  });

  it('insists on a key for KMAC', async () => {
    await expect(xofBytes('kmac128', [seq(1)])).rejects.toThrow(/needs a key/);
  });

  it('refuses a customization string where SHAKE has nowhere to put it', async () => {
    await expect(xofBytes('shake256', [seq(1)], { customization: utf8('S') })).rejects.toThrow(
      /does not take a customization string/,
    );
  });

  it('refuses a function name outside cSHAKE', async () => {
    await expect(
      xofBytes('kmac128', [seq(1)], { key: utf8('k'), functionName: utf8('N') }),
    ).rejects.toThrow(/fixes its function name/);
  });

  it('refuses a block size outside ParallelHash', async () => {
    await expect(xofBytes('shake128', [seq(1)], { blockLen: 8 })).rejects.toThrow(
      /does not take a block size/,
    );
  });

  it('refuses more than one input where the function takes one', async () => {
    await expect(xofBytes('shake128', [seq(1), seq(2)])).rejects.toThrow(/takes one input, not 2/);
  });

  it.each([0, -1, 1.5])('refuses an output length of %s', async (dkLen) => {
    await expect(xofBytes('shake128', [seq(1)], { dkLen })).rejects.toThrow(/produces 1 to/);
  });

  it('defaults each function to its natural length', () => {
    for (const id of XOF_IDS) {
      const params = resolveParams(id, XOFS[id].key === 'required' ? { key: utf8('k') } : {});
      expect(params.dkLen, id).toBe(XOFS[id].defaultLen);
      expect(params.dkLen, id).toBe(XOFS[id].strength === 128 ? 32 : 64);
    }
  });

  it('drops an empty customization string rather than passing it on', () => {
    const params = resolveParams('cshake128', { customization: new Uint8Array(0) });
    expect(params.customization).toBeUndefined();
  });
});

describe('the catalogue', () => {
  it('computes something for every function in the table', async () => {
    for (const id of XOF_IDS) {
      const digest = await xofBytes(id, [utf8('abc')], paramsFor(id));
      expect(digest.length, id).toBe(XOFS[id].defaultLen);
    }
  });
});
