import { describe, expect, it } from 'vitest';
import { hashBytes } from '~/lib/algo/hash';
import { HASHES, HASH_IDS, type HashId } from '~/lib/algo/hashes';
import { bytesToHex, hexToBytes, textToBytes } from '~/lib/encoding';

async function hex(id: HashId, text: string, key?: Uint8Array): Promise<string> {
  return bytesToHex(await hashBytes(id, textToBytes(text, 'utf-8'), key));
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
    expect(await hex('md5', 'Hi There', hexToBytes('0b'.repeat(16)))).toBe(
      '9294727a3638bb1c13f48ef8158bfc9d',
    );
  });

  it('HMAC-MD5, RFC 2202 case 2 (ASCII key)', async () => {
    expect(await hex('md5', 'what do ya want for nothing?', textToBytes('Jefe', 'utf-8'))).toBe(
      '750c783e6ab0b503eaa86e310a5db738',
    );
  });

  it('HMAC-SHA-1, RFC 2202 case 1', async () => {
    expect(await hex('sha1', 'Hi There', hexToBytes('0b'.repeat(20)))).toBe(
      'b617318655057264e28bc0b6fb378c8ef146be00',
    );
  });

  it('HMAC-SHA-256, RFC 4231 case 1', async () => {
    expect(await hex('sha256', 'Hi There', hexToBytes('0b'.repeat(20)))).toBe(
      'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
    );
  });

  it('HMAC-SHA-256, RFC 4231 case 3 (key and data longer than the block size logic)', async () => {
    const digest = bytesToHex(
      await hashBytes('sha256', hexToBytes('dd'.repeat(50)), hexToBytes('aa'.repeat(20))),
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
  function pattern(length: number): Uint8Array {
    return new Uint8Array(length).map((_, i) => i % 251);
  }

  const vectors: ReadonlyArray<[number, string]> = [
    [0, 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262'],
    [1, '2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213'],
    [1024, '42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7'],
  ];

  it.each(vectors)('input_len %i', async (length, expected) => {
    expect(bytesToHex(await hashBytes('blake3', pattern(length)))).toBe(expected);
  });
});
