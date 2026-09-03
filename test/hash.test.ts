import { describe, expect, it } from 'vitest';
import { hashBytes, hashBlob, type HashParams } from '~/lib/algo/hash';
import { HASHES, HASH_IDS, type HashId } from '~/lib/algo/hashes';
import { bytesToHex, hexToBytes, textToBytes } from '~/lib/encoding';

async function hex(id: HashId, text: string, params?: HashParams): Promise<string> {
  return bytesToHex(await hashBytes(id, textToBytes(text, 'utf-8'), params));
}

/** RFC 1321, appendix A.5. */
describe('MD5 (RFC 1321 test suite)', () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    [
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      'd174ab98d277d9f5a5611c2c9f419d9f',
    ],
    [
      '12345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '57edf4a22be3c955ac49da2e2107b67a',
    ],
  ];

  it.each(vectors)('md5(%j)', async (input, expected) => {
    expect(await hex('md5', input)).toBe(expected);
  });
});

/** RFC 3174 / FIPS 180-4. */
describe('SHA-1', () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ['', 'da39a3ee5e6b4b0d3255bfef95601890afd80709'],
    ['abc', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    ],
  ];

  it.each(vectors)('sha1(%j)', async (input, expected) => {
    expect(await hex('sha1', input)).toBe(expected);
  });

  it('handles the million-a vector', async () => {
    expect(await hex('sha1', 'a'.repeat(1_000_000))).toBe(
      '34aa973cd4c4daa4f61eeb2bdbad27316534016f',
    );
  });
});

/** FIPS 180-4. */
describe('SHA-256', () => {
  const vectors: ReadonlyArray<[string, string]> = [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ];

  it.each(vectors)('sha256(%j)', async (input, expected) => {
    expect(await hex('sha256', input)).toBe(expected);
  });
});

/** HMAC-MD5 and HMAC-SHA-1 from RFC 2202; HMAC-SHA-256 from RFC 4231. */
describe('HMAC', () => {
  it('HMAC-MD5, RFC 2202 case 1', async () => {
    expect(await hex('md5', 'Hi There', { hmacKey: hexToBytes('0b'.repeat(16)) })).toBe(
      '9294727a3638bb1c13f48ef8158bfc9d',
    );
  });

  it('HMAC-MD5, RFC 2202 case 2 (ASCII key)', async () => {
    const key = { hmacKey: textToBytes('Jefe', 'utf-8') };
    expect(await hex('md5', 'what do ya want for nothing?', key)).toBe(
      '750c783e6ab0b503eaa86e310a5db738',
    );
  });

  it('HMAC-SHA-1, RFC 2202 case 1', async () => {
    expect(await hex('sha1', 'Hi There', { hmacKey: hexToBytes('0b'.repeat(20)) })).toBe(
      'b617318655057264e28bc0b6fb378c8ef146be00',
    );
  });

  it('HMAC-SHA-256, RFC 4231 case 1', async () => {
    expect(await hex('sha256', 'Hi There', { hmacKey: hexToBytes('0b'.repeat(20)) })).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('HMAC-SHA-256, RFC 4231 case 3 (key and data longer than the block size logic)', async () => {
    const digest = bytesToHex(
      await hashBytes('sha256', hexToBytes('dd'.repeat(50)), {
        hmacKey: hexToBytes('aa'.repeat(20)),
      }),
    );
    expect(digest).toBe('773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe');
  });
});

describe('registry metadata', () => {
  it('declares a digest size matching the actual output', async () => {
    for (const meta of Object.values(HASHES)) {
      const digest = await hashBytes(meta.id, new Uint8Array(0));
      expect(digest.length * 8, `${meta.label} digest size`).toBe(meta.bits);
    }
  });
});

/**
 * Digest of "abc" for every algorithm in the catalogue.
 *
 * For the fifteen algorithms OpenSSL implements, parity.test.ts is the real
 * proof of correctness and this table is a fast regression anchor. For Keccak
 * and BLAKE3 it is the primary check, and those values come from published
 * sources rather than from this codebase -- see the block below.
 */
describe('digest of "abc" across the catalogue', () => {
  const vectors: ReadonlyArray<[HashId, string]> = [
    ['md5', '900150983cd24fb0d6963f7d28e17f72'],
    ['sha1', 'a9993e364706816aba3e25717850c26c9cd0d89d'],
    ['ripemd160', '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc'],
    ['sha224', '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7'],
    ['sha256', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['double-sha256', '4f8b42c22dd3729b519ba6f68d2da7cc5b2d606d05daed5ad5128cc03e6c6358'],
    [
      'sha384',
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    ],
    [
      'sha512',
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    ],
    ['sha512-224', '4634270f707b6a54daae7530460842e20e37ed265ceee9a43e8924aa'],
    ['sha512-256', '53048e2681941ef99b2e29b76b4c7dabe4c2d0c634fc6d46e0e2f13107e7af23'],
    ['sha3-224', 'e642824c3f8cf24ad09234ee7d3c766fc9a3a5168d0c94ad73b46fdf'],
    ['sha3-256', '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'],
    [
      'sha3-384',
      'ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25',
    ],
    [
      'sha3-512',
      'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0',
    ],
    ['keccak-224', 'c30411768506ebe1c2871b1ee2e87d38df342317300a9b97a95ec6a8'],
    ['keccak-256', '4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'],
    [
      'keccak-384',
      'f7df1165f033337be098e7d288ad6a2f74409d7a60b49c36642218de161b1f99f8c681e4afaf31a34db29fb763e3c28e',
    ],
    [
      'keccak-512',
      '18587dc2ea106b9a1563e32b3312421ca164c7f1f07bc922a9c83d77cea3a1e5d0c69910739025372dc14ac9642629379540c17e2a65b19d77aa511a9d00bb96',
    ],
    [
      'blake2b',
      'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923',
    ],
    ['blake2s', '508c5e8c327c14e2e1a72ba34eeb452f37458b209ed63a294d999b4c86675982'],
    ['blake3', '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85'],
  ];

  it.each(vectors)('%s', async (id, expected) => {
    expect(await hex(id, 'abc')).toBe(expected);
  });

  it('covers every algorithm in the registry', () => {
    expect(new Set(vectors.map(([id]) => id))).toEqual(new Set(HASH_IDS));
  });
});

/**
 * Keccak as Ethereum uses it: the original padding, not the 0x06 domain
 * separator NIST added when standardising SHA-3. Getting this wrong produces
 * a plausible-looking digest that is wrong everywhere it matters, so it is
 * pinned to the widely published empty-string value.
 */
describe('Keccak uses the original padding, not SHA-3 padding', () => {
  it('keccak-256 of the empty string is the value Ethereum depends on', async () => {
    expect(await hex('keccak-256', '')).toBe(
      'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470',
    );
  });

  it('differs from SHA3-256 for the same input', async () => {
    expect(await hex('keccak-256', 'abc')).not.toBe(await hex('sha3-256', 'abc'));
  });
});

/** From the BLAKE3 team's test_vectors.json, which uses a repeating 0..250 byte pattern. */
describe('BLAKE3 official vectors', () => {
  /** The input schedule the BLAKE3 team's test_vectors.json uses. */
  function pattern(length: number): Uint8Array {
    return new Uint8Array(length).map((_, i) => i % 251);
  }

  /** The 32-byte key those vectors are keyed with, verbatim. */
  const KEY = textToBytes('whats the Elvish word for friend', 'utf-8');

  /**
   * Each published case carries 131 bytes of output, which is what makes these
   * vectors worth using twice over: they pin the extended-output path and the
   * keyed path at once, from the same authority.
   */
  const vectors: ReadonlyArray<[number, string, string]> = [
    [0, 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262e00f03e7b69af26b7faaf09fcd333050338ddfe085b8cc869ca98b206c08243a26f5487789e8f660afe6c99ef9e0c52b92e7393024a80459cf91f476f9ffdbda7001c22e159b402631f277ca96f2defdf1078282314e763699a31c5363165421cce14d',
      '92b2b75604ed3c761f9d6f62392c8a9227ad0ea3f09573e783f1498a4ed60d26b18171a2f22a4b94822c701f107153dba24918c4bae4d2945c20ece13387627d3b73cbf97b797d5e59948c7ef788f54372df45e45e4293c7dc18c1d41144a9758be58960856be1eabbe22c2653190de560ca3b2ac4aa692a9210694254c371e851bc8f'],
    [1, '2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213c3a6cb8bf623e20cdb535f8d1a5ffb86342d9c0b64aca3bce1d31f60adfa137b358ad4d79f97b47c3d5e79f179df87a3b9776ef8325f8329886ba42f07fb138bb502f4081cbcec3195c5871e6c23e2cc97d3c69a613eba131e5f1351f3f1da786545e5',
      '6d7878dfff2f485635d39013278ae14f1454b8c0a3a2d34bc1ab38228a80c95b6568c0490609413006fbd428eb3fd14e7756d90f73a4725fad147f7bf70fd61c4e0cf7074885e92b0e3f125978b4154986d4fb202a3f331a3fb6cf349a3a70e49990f98fe4289761c8602c4e6ab1138d31d3b62218078b2f3ba9a88e1d08d0dd4cea11'],
    [1024, '42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af71cf8107265ecdaf8505b95d8fcec83a98a6a96ea5109d2c179c47a387ffbb404756f6eeae7883b446b70ebb144527c2075ab8ab204c0086bb22b7c93d465efc57f8d917f0b385c6df265e77003b85102967486ed57db5c5ca170ba441427ed9afa684e',
      '75c46f6f3d9eb4f55ecaaee480db732e6c2105546f1e675003687c31719c7ba4a78bc838c72852d4f49c864acb7adafe2478e824afe51c8919d06168414c265f298a8094b1ad813a9b8614acabac321f24ce61c5a5346eb519520d38ecc43e89b5000236df0597243e4d2493fd626730e2ba17ac4d8824d09d1a4a8f57b8227778e2de'],
  ];

  it.each(vectors)('input_len %i, default 32-byte digest', async (length, expected) => {
    expect(bytesToHex(await hashBytes('blake3', pattern(length)))).toBe(expected.slice(0, 64));
  });

  it.each(vectors)('input_len %i, extended to 131 bytes', async (length, expected) => {
    const out = await hashBytes('blake3', pattern(length), { dkLen: 131 });
    expect(bytesToHex(out)).toBe(expected);
  });

  it.each(vectors)('input_len %i, keyed', async (length, _unkeyed, expected) => {
    const out = await hashBytes('blake3', pattern(length), { key: KEY, dkLen: 131 });
    expect(bytesToHex(out)).toBe(expected);
  });

  it('extends rather than replaces: a short output is a prefix of a long one', async () => {
    const short = bytesToHex(await hashBytes('blake3', pattern(1024), { dkLen: 32 }));
    const long = bytesToHex(await hashBytes('blake3', pattern(1024), { dkLen: 131 }));
    expect(long.startsWith(short)).toBe(true);
  });
});

/**
 * Keyed BLAKE2, and BLAKE2 at a length other than its default.
 *
 * These expected values come from two implementations sharing no code with
 * @noble/hashes, and were confirmed to agree with it before being written
 * down: OpenSSL 3.5.5 for the keyed cases, reached as
 * `openssl mac -macopt hexkey:<key> -macopt size:<n> BLAKE2BMAC`, and GNU
 * coreutils `b2sum -l <bits>` for the unkeyed short digests.
 *
 * They are fixed vectors here rather than live comparisons in parity.test.ts
 * because OpenSSL exposes BLAKE2 keying only through EVP_MAC, which
 * node:crypto does not surface -- createHmac would give HMAC-BLAKE2, a
 * different construction that happens to have the same output shape.
 */
describe('BLAKE2 native keying and digest length', () => {
  const KEY = hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');

  const vectors: ReadonlyArray<[string, HashId, HashParams, string]> = [
    ['blake2b keyed, default 64 bytes', 'blake2b', { key: KEY },
      '9af0244b7da7fe29d90a89727e06a0c93977ce1ad7edcb76ac0b24142194ea00' +
      'c77be4a1d3fededd31d5a593625a508e742fc90d708f8b48a5c246e4e8e42d94'],
    ['blake2b keyed, 32 bytes', 'blake2b', { key: KEY, dkLen: 32 },
      'd63a32d3e44738d7907f964316c241adaba0abfeabc32349677578a15a203f7f'],
    ['blake2s keyed, default 32 bytes', 'blake2s', { key: KEY },
      'a281f725754969a702f6fe36fc591b7def866e4b70173ece402fc01c064d6b65'],
    ['blake2s keyed, 16 bytes', 'blake2s', { key: KEY, dkLen: 16 },
      '61ba5f165c194692e09d12520cc4c74a'],
    ['blake2b unkeyed, 16 bytes', 'blake2b', { dkLen: 16 },
      'cf4ab791c62b8d2b2109c90275287816'],
    ['blake2b unkeyed, 32 bytes', 'blake2b', { dkLen: 32 },
      'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319'],
  ];

  it.each(vectors)('%s', async (_name, id, params, expected) => {
    expect(await hex(id, 'abc', params)).toBe(expected);
  });

  it('reseeds rather than truncates when the length changes', async () => {
    const short = await hex('blake2b', 'abc', { dkLen: 32 });
    const full = await hex('blake2b', 'abc');
    // Unlike BLAKE3, BLAKE2 folds the requested length into the parameter
    // block that seeds the state, so a shorter digest is a different value
    // rather than a prefix. Getting this wrong would look plausible.
    expect(full.startsWith(short)).toBe(false);
  });
});

describe('parameters the algorithm does not accept are refused', () => {
  const data = textToBytes('abc', 'utf-8');

  it('rejects a key for an algorithm that takes none', async () => {
    await expect(hashBytes('sha256', data, { key: new Uint8Array(32) })).rejects.toThrow(
      /does not take a key/,
    );
  });

  it('rejects a key of the wrong size', async () => {
    await expect(hashBytes('blake3', data, { key: new Uint8Array(16) })).rejects.toThrow(
      /needs a key of exactly 32 bytes; got 16/,
    );
  });

  it('rejects a digest length for a fixed-length algorithm', async () => {
    await expect(hashBytes('sha256', data, { dkLen: 16 })).rejects.toThrow(
      /always produces 32 bytes/,
    );
  });

  it('rejects a digest length outside the declared range', async () => {
    await expect(hashBytes('blake2s', data, { dkLen: 33 })).rejects.toThrow(
      /produces 1 to 32 bytes; got 33/,
    );
    await expect(hashBytes('blake2s', data, { dkLen: 0 })).rejects.toThrow(/got 0/);
    await expect(hashBytes('blake2s', data, { dkLen: 8.5 })).rejects.toThrow(/got 8.5/);
  });

  it('rejects an HMAC key and a native key together', async () => {
    await expect(
      hashBytes('blake2b', data, { hmacKey: new Uint8Array(8), key: new Uint8Array(8) }),
    ).rejects.toThrow(/does not support HMAC/);
  });
});

describe('every declared capability is real', () => {
  const data = textToBytes('the quick brown fox', 'utf-8');
  const keyed = HASH_IDS.filter((id) => HASHES[id].key !== undefined);
  const sized = HASH_IDS.filter((id) => HASHES[id].dkLen !== undefined);

  it('is claimed by the BLAKE family and nobody else', () => {
    expect(keyed).toEqual(['blake2b', 'blake2s', 'blake3']);
    expect(sized).toEqual(['blake2b', 'blake2s', 'blake3']);
  });

  it.each(keyed)('%s accepts a key at both ends of its range', async (id) => {
    const range = HASHES[id].key!;
    const unkeyed = bytesToHex(await hashBytes(id, data));

    for (const size of [range.min, range.max]) {
      const key = new Uint8Array(size).fill(7);
      const digest = bytesToHex(await hashBytes(id, data, { key }));
      expect(digest, `key of ${size} bytes`).not.toBe(unkeyed);
    }
  });

  it.each(sized)('%s honours both ends of its length range', async (id) => {
    const range = HASHES[id].dkLen!;
    expect((await hashBytes(id, data, { dkLen: range.min })).length).toBe(range.min);
    expect((await hashBytes(id, data, { dkLen: range.max })).length).toBe(range.max);
    expect((await hashBytes(id, data)).length).toBe(HASHES[id].bits / 8);
  });

  it.each(sized)('%s streams to the same digest as it hashes in one piece', async (id) => {
    const params: HashParams = {
      key: new Uint8Array(HASHES[id].key!.min).fill(3),
      dkLen: HASHES[id].dkLen!.max,
    };
    const bytes = new Uint8Array(300_000).map((_, i) => i % 256);

    const streamed = await hashBlob(id, new Blob([bytes]), params);
    expect(bytesToHex(streamed)).toBe(bytesToHex(await hashBytes(id, bytes, params)));
  });
});
