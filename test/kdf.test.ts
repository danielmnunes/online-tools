/**
 * Key derivation, checked the same three ways the hashes are.
 *
 * PBKDF2, HKDF and scrypt are all in node:crypto, so those get live parity
 * against OpenSSL over a spread of parameters rather than a handful of fixed
 * vectors. Argon2 is not, so it gets the RFC 9106 vectors plus values from
 * Bouncy Castle. EvpKDF is in neither, so it gets values from the `openssl
 * enc` command line, with the command recorded next to them.
 */
import { hkdfSync, pbkdf2Sync, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveKey, verifyKdf, type KdfInputs } from '~/lib/algo/kdf';
import { KDFS, KDF_HASHES, defaultCost, type KdfId } from '~/lib/algo/kdfs';
import { hashBytes } from '~/lib/algo/hash';
import { bytesToHex, textToBytes } from '~/lib/encoding';
import { formatArgon2, formatScrypt, parseEncoded } from '~/lib/phc';

const utf8 = (text: string) => textToBytes(text, 'utf-8');
const seq = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff);

function inputs(id: KdfId, over: Partial<KdfInputs> = {}): KdfInputs {
  return {
    password: utf8('password'),
    salt: utf8('saltsaltsaltsalt'),
    cost: defaultCost(id),
    dkLen: 32,
    ...over,
  };
}

async function key(id: KdfId, over: Partial<KdfInputs> = {}): Promise<string> {
  return bytesToHex((await deriveKey(id, inputs(id, over))).key);
}

/**
 * Hashes node:crypto does not implement, and so cannot be the oracle for.
 *
 * OpenSSL ships SHA-3 but not the original-padding Keccak, exactly as in
 * test/parity.test.ts. Listing them rather than filtering silently means an
 * algorithm cannot lose its cross-check by accident.
 */
const NOT_IN_OPENSSL = ['keccak-224', 'keccak-256', 'keccak-384', 'keccak-512'] as const;

const OPENSSL_PBKDF2_HASHES = KDF_HASHES.filter(
  (id) => !(NOT_IN_OPENSSL as ReadonlyArray<string>).includes(id),
);

describe('PBKDF2 matches OpenSSL', () => {
  it('accounts for every hash the tool offers', () => {
    expect([...OPENSSL_PBKDF2_HASHES, ...NOT_IN_OPENSSL].sort()).toEqual([...KDF_HASHES].sort());
  });

  it.each(OPENSSL_PBKDF2_HASHES)('PBKDF2-HMAC-%s', async (hash) => {
    const password = utf8('correct horse battery staple');
    const salt = seq(16);
    const expected = pbkdf2Sync(password, salt, 1000, 40, hash).toString('hex');
    expect(
      await key('pbkdf2', { password, hash, salt, dkLen: 40, cost: { iterations: 1000 } }),
    ).toBe(expected);
  });

  /**
   * PBKDF2 over the Keccak hashes, against RFC 8018 section 5.2 written out
   * directly. HMAC-Keccak is itself checked against published Keccak vectors
   * in hash.test.ts, so this closes the loop for the four algorithms OpenSSL
   * cannot speak for.
   */
  it.each(NOT_IN_OPENSSL)('PBKDF2-HMAC-%s against RFC 8018 written out', async (hash) => {
    const password = utf8('correct horse battery staple');
    const salt = seq(16);
    const iterations = 100;
    const dkLen = 40;

    const prf = async (data: Uint8Array) => hashBytes(hash, data, { hmacKey: password });
    const out = new Uint8Array(dkLen);
    let written = 0;
    for (let block = 1; written < dkLen; block++) {
      const seed = new Uint8Array(salt.length + 4);
      seed.set(salt);
      new DataView(seed.buffer).setUint32(salt.length, block);

      let u = await prf(seed);
      const acc = u.slice();
      for (let i = 1; i < iterations; i++) {
        u = await prf(u);
        for (let j = 0; j < acc.length; j++) acc[j]! ^= u[j]!;
      }
      const take = Math.min(acc.length, dkLen - written);
      out.set(acc.subarray(0, take), written);
      written += take;
    }

    expect(await key('pbkdf2', { password, hash, salt, dkLen, cost: { iterations } })).toBe(
      bytesToHex(out),
    );
  });

  it.each([1, 2, 4096, 10_000])('at %i iterations', async (iterations) => {
    const salt = utf8('salt');
    const expected = pbkdf2Sync('passwd', salt, iterations, 64, 'sha256').toString('hex');
    expect(
      await key('pbkdf2', {
        password: utf8('passwd'),
        salt,
        dkLen: 64,
        cost: { iterations },
        hash: 'sha256',
      }),
    ).toBe(expected);
  });

  it.each([1, 15, 16, 17, 31, 32, 33, 64, 100])('for a %i-byte key', async (dkLen) => {
    const expected = pbkdf2Sync('pw', 'sa', 100, dkLen, 'sha512').toString('hex');
    expect(
      await key('pbkdf2', {
        password: utf8('pw'),
        salt: utf8('sa'),
        dkLen,
        cost: { iterations: 100 },
        hash: 'sha512',
      }),
    ).toBe(expected);
  });

  /** RFC 6070, the PBKDF2-HMAC-SHA1 test vectors. */
  it.each([
    ['password', 'salt', 1, 20, '0c60c80f961f0e71f3a9b524af6012062fe037a6'],
    ['password', 'salt', 2, 20, 'ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957'],
    ['password', 'salt', 4096, 20, '4b007901b765489abead49d926f721d065a429c1'],
    [
      'passwordPASSWORDpassword',
      'saltSALTsaltSALTsaltSALTsaltSALTsalt',
      4096,
      25,
      '3d2eec4fe41c849b80c8d83662c0e44a8b291a964cf2f07038',
    ],
  ])('RFC 6070: %j / %j / %i', async (password, salt, iterations, dkLen, expected) => {
    expect(
      await key('pbkdf2', {
        password: utf8(password),
        salt: utf8(salt),
        dkLen,
        cost: { iterations },
        hash: 'sha1',
      }),
    ).toBe(expected);
  });
});

describe('HKDF matches OpenSSL', () => {
  it.each(['sha256', 'sha512', 'sha1'] as const)('HKDF-%s', async (hash) => {
    const ikm = seq(32);
    const salt = seq(13);
    const info = utf8('application context');
    const expected = Buffer.from(hkdfSync(hash, ikm, salt, info, 42)).toString('hex');
    expect(await key('hkdf', { password: ikm, salt, info, hash, dkLen: 42 })).toBe(expected);
  });

  it('treats an absent salt as a string of zeros, as RFC 5869 says', async () => {
    const ikm = seq(22);
    const expected = Buffer.from(
      hkdfSync('sha256', ikm, new Uint8Array(32), new Uint8Array(0), 42),
    ).toString('hex');
    expect(
      await key('hkdf', { password: ikm, salt: new Uint8Array(0), hash: 'sha256', dkLen: 42 }),
    ).toBe(expected);
  });

  /** RFC 5869 appendix A.1. */
  it('RFC 5869 test case 1', async () => {
    expect(
      await key('hkdf', {
        password: new Uint8Array(22).fill(0x0b),
        salt: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        info: Uint8Array.from([0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9]),
        hash: 'sha256',
        dkLen: 42,
      }),
    ).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });
});

describe('scrypt matches OpenSSL', () => {
  it.each([
    [2, 1, 1],
    [16, 8, 1],
    [1024, 8, 1],
    [1024, 8, 16],
    [16384, 8, 1],
  ])('N=%i r=%i p=%i', async (N, r, p) => {
    const expected = scryptSync('pleaseletmein', 'SodiumChloride', 64, {
      N,
      r,
      p,
      maxmem: 512 * 1024 * 1024,
    }).toString('hex');
    expect(
      await key('scrypt', {
        password: utf8('pleaseletmein'),
        salt: utf8('SodiumChloride'),
        cost: { N, r, p },
        dkLen: 64,
      }),
    ).toBe(expected);
  });

  /** RFC 7914 section 11. */
  it('RFC 7914 vector', async () => {
    expect(
      await key('scrypt', {
        password: utf8('password'),
        salt: utf8('NaCl'),
        cost: { N: 1024, r: 8, p: 16 },
        dkLen: 64,
      }),
    ).toBe(
      'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162' +
        '2eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640',
    );
  });
});

/**
 * Argon2's RFC 9106 vectors, then a spread produced by Bouncy Castle 1.83.
 * The RFC values use every optional input at once -- secret and associated
 * data included -- which is why they are the ones worth having.
 */
describe('Argon2', () => {
  // RFC 9106 section 5: 32 bytes of 0x01, 16 of 0x02, secret of 8 x 0x03,
  // associated data of 12 x 0x04, t=3, m=32, p=4, 32 bytes out.
  const rfc = {
    password: new Uint8Array(32).fill(1),
    salt: new Uint8Array(16).fill(2),
    secret: new Uint8Array(8).fill(3),
    associatedData: new Uint8Array(12).fill(4),
    cost: { t: 3, m: 32, p: 4 },
    dkLen: 32,
  };

  it.each([
    ['argon2d', '512b391b6f1162975371d30919734294f868e3be3984f3c1a13a4db9fabe4acb'],
    ['argon2i', 'c814d9d1dc7f37aa13f0d77f2494bda1c8de6b016dd388d29952a4c4672b6ce8'],
    ['argon2id', '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659'],
  ] as const)('RFC 9106 vector for %s', async (id, expected) => {
    expect(await key(id, rfc)).toBe(expected);
  });

  it('changes the answer when the secret or the associated data changes', async () => {
    const base = await key('argon2id', rfc);
    expect(await key('argon2id', { ...rfc, secret: new Uint8Array(8).fill(9) })).not.toBe(base);
    expect(await key('argon2id', { ...rfc, associatedData: new Uint8Array(12) })).not.toBe(base);
    const { secret, associatedData, ...bare } = rfc;
    expect(await key('argon2id', bare)).not.toBe(base);
  });

  it.each([
    ['argon2id', { t: 2, m: 65536, p: 1 }, 32, '1e6938f511f9d7a88f1c6a4a49d446685ce2e3f58ecf335e07950920a0201dbb'],
    ['argon2i', { t: 1, m: 8, p: 1 }, 24, '10ac49b323fb7bbcc4e45faf737bd11d88d0d2c34801f71a'],
    [
      'argon2d',
      { t: 4, m: 256, p: 2 },
      64,
      'ae42c42355f3f444d2ea9e61b42cdc75cdd9e3dfbe32475423756c396aa5efc3' +
        '8b2e9ddfcb243e230981c74fb3c54566c68bbacb253019af926e7570a6b1bec6',
    ],
  ] as const)('Bouncy Castle parity: %s', async (id, cost, dkLen, expected) => {
    expect(
      await key(id, {
        password: utf8('password'),
        salt: utf8('somesalt12345678'),
        cost,
        dkLen,
      }),
    ).toBe(expected);
  });

  it('produces a PHC string that round-trips', async () => {
    const result = await deriveKey(
      'argon2id',
      inputs('argon2id', { cost: { t: 1, m: 64, p: 1 } }),
    );
    expect(result.encoded).toMatch(/^\$argon2id\$v=19\$m=64,t=1,p=1\$/);
    const parsed = parseEncoded(result.encoded!);
    expect(bytesToHex(parsed.digest)).toBe(bytesToHex(result.key));
    expect(parsed.cost).toEqual({ m: 64, t: 1, p: 1 });
  });
});

/**
 * EvpKDF, checked against the OpenSSL command line. Each expectation is the
 * concatenation of the key and IV that
 *
 *   openssl enc -<cipher> -md <md> -pass pass:<password> -S <salt> -P
 *
 * prints, which is exactly the first keyLen + ivLen bytes EVP_BytesToKey
 * produces. Generated with OpenSSL 3.5.5.
 */
describe('EvpKDF matches OpenSSL', () => {
  it.each([
    ['md5', 'password', '0102030405060708', 32, 'e7b0971e52ca5cc8d0539fb3412f6316f7ba2e6ee293d9f3457b99436b51ce02'],
    [
      'md5',
      'password',
      '0102030405060708',
      48,
      'e7b0971e52ca5cc8d0539fb3412f6316f7ba2e6ee293d9f3457b99436b51ce02' +
        '8d450e2ed75a84a923d4eac9fe49226b',
    ],
    [
      'sha256',
      'hunter2',
      'a1b2c3d4e5f60718',
      48,
      'c7bc1224132449aa1ac947becb92716673f9d69572630ddb06f5ad135fc9b326' +
        '5facf42af139615d48a4bc705df0ed5e',
    ],
    ['sha1', '', '0000000000000000', 32, '05fe405753166f125559e7c9ac558654f107c7e9a766e4c0ec76781ad0a4604d'],
    [
      'sha512',
      'correct horse',
      'ffeeddccbbaa9988',
      48,
      '62a06b1459805442fc7e537bf422fbda11387c7d29eb64f2082e8f79c536cd09' +
        '54b74846542301ba3e2345718a8ebec8',
    ],
    ['sha256', '', '0011223344556677', 16, 'd1a5f998fa6ed82da6943127533b412f'],
  ] as const)('%s, password %j', async (hash, password, saltHex, dkLen, expected) => {
    expect(
      await key('evpkdf', {
        password: utf8(password),
        salt: textToBytes(saltHex, 'hex'),
        hash,
        dkLen,
        cost: { iterations: 1 },
      }),
    ).toBe(expected);
  });

  it('re-hashes the block, not the password, when iterations rise', async () => {
    // D_1 with count 2 is H(H(password || salt)), which is checkable directly.
    const one = await key('evpkdf', {
      password: utf8('p'),
      salt: utf8('s'),
      hash: 'md5',
      dkLen: 16,
      cost: { iterations: 1 },
    });
    const two = await key('evpkdf', {
      password: utf8('p'),
      salt: utf8('s'),
      hash: 'md5',
      dkLen: 16,
      cost: { iterations: 2 },
    });
    const { hashBytes } = await import('~/lib/algo/hash');
    expect(two).toBe(bytesToHex(await hashBytes('md5', textToBytes(one, 'hex'))));
  });
});

describe('the encoded forms', () => {
  it('writes a Django PBKDF2 string that Django would recognise', async () => {
    const result = await deriveKey(
      'pbkdf2',
      inputs('pbkdf2', { salt: utf8('abcdefgh'), cost: { iterations: 1000 }, hash: 'sha256' }),
    );
    expect(result.encoded).toMatch(/^pbkdf2_sha256\$1000\$abcdefgh\$/);
    const parsed = parseEncoded(result.encoded!);
    expect(parsed.hash).toBe('sha256');
    expect(bytesToHex(parsed.digest)).toBe(bytesToHex(result.key));
  });

  it('writes an scrypt PHC string with log2(N), as the format wants', async () => {
    const power = await deriveKey('scrypt', inputs('scrypt', { cost: { N: 1024, r: 8, p: 1 } }));
    expect(power.encoded).toMatch(/^\$scrypt\$ln=10,r=8,p=1\$/);
  });

  it('refuses an N that is not a power of two, naming the nearest one', async () => {
    await expect(
      deriveKey('scrypt', inputs('scrypt', { cost: { N: 1000, r: 8, p: 1 } })),
    ).rejects.toThrow(/power of two; 1000 is not. Try 1024/);
  });

  it('has no PHC string to write when N is not a power of two', () => {
    expect(formatScrypt({ N: 1000, r: 8, p: 1 }, new Uint8Array(8), new Uint8Array(8))).toBeUndefined();
  });

  it('gives HKDF and EvpKDF no encoded form, because there is not one', async () => {
    expect((await deriveKey('hkdf', inputs('hkdf'))).encoded).toBeUndefined();
    expect((await deriveKey('evpkdf', inputs('evpkdf'))).encoded).toBeUndefined();
  });
});

describe('verification', () => {
  it('checks a password against an Argon2 PHC string', async () => {
    const stored = formatArgon2(
      'argon2id',
      { m: 64, t: 1, p: 1 },
      utf8('saltsaltsaltsalt'),
      (await deriveKey('argon2id', inputs('argon2id', { cost: { t: 1, m: 64, p: 1 } }))).key,
    );

    const good = await verifyKdf('argon2id', stored, inputs('argon2id'));
    expect(good.matches).toBe(true);
    expect(good.source).toBe('encoded');
    expect(good.parameters).toBe('m=64, t=1, p=1');

    const bad = await verifyKdf(
      'argon2id',
      stored,
      inputs('argon2id', { password: utf8('wrong') }),
    );
    expect(bad.matches).toBe(false);
  });

  it('takes the parameters from the string, not the form', async () => {
    // The form says t=2 (the default); the string says t=1. If the form won,
    // this would not match.
    const stored = (
      await deriveKey('argon2id', inputs('argon2id', { cost: { t: 1, m: 64, p: 1 } }))
    ).encoded!;
    expect((await verifyKdf('argon2id', stored, inputs('argon2id'))).matches).toBe(true);
  });

  it('checks a bcrypt hash', async () => {
    const stored = '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i';
    expect(
      (await verifyKdf('bcrypt', stored, inputs('bcrypt', { password: utf8('abc') }))).matches,
    ).toBe(true);
    expect(
      (await verifyKdf('bcrypt', stored, inputs('bcrypt', { password: utf8('abd') }))).matches,
    ).toBe(false);
  });

  it('falls back to comparing a bare digest with the form parameters', async () => {
    const derived = await deriveKey(
      'scrypt',
      inputs('scrypt', { cost: { N: 16, r: 1, p: 1 } }),
    );
    const outcome = await verifyKdf(
      'scrypt',
      bytesToHex(derived.key),
      inputs('scrypt', { cost: { N: 16, r: 1, p: 1 } }),
    );
    expect(outcome.matches).toBe(true);
    expect(outcome.source).toBe('raw');
    expect(outcome.parameters).toBe('N=16, r=1, p=1');
  });

  it('accepts a bare digest in base64 as readily as hex', async () => {
    const derived = await deriveKey('scrypt', inputs('scrypt', { cost: { N: 16, r: 1, p: 1 } }));
    const base64 = Buffer.from(derived.key).toString('base64');
    expect(
      (await verifyKdf('scrypt', base64, inputs('scrypt', { cost: { N: 16, r: 1, p: 1 } })))
        .matches,
    ).toBe(true);
  });

  it('says so when the pasted hash belongs to another algorithm', async () => {
    const stored = (await deriveKey('argon2id', inputs('argon2id', { cost: { t: 1, m: 64, p: 1 } })))
      .encoded!;
    await expect(verifyKdf('scrypt', stored, inputs('scrypt'))).rejects.toThrow(/Argon2id/);
  });

  it('refuses an empty expected value', async () => {
    await expect(verifyKdf('scrypt', '   ', inputs('scrypt'))).rejects.toThrow(/Paste the hash/);
  });
});

describe('input validation', () => {
  it('insists on a salt where the algorithm needs one', async () => {
    for (const id of ['pbkdf2', 'scrypt', 'argon2id'] as const) {
      await expect(
        deriveKey(id, inputs(id, { salt: new Uint8Array(0) })),
      ).rejects.toThrow(/needs a salt/);
    }
  });

  it('insists on bcrypt’s 16-byte salt', async () => {
    await expect(
      deriveKey('bcrypt', inputs('bcrypt', { salt: utf8('short') })),
    ).rejects.toThrow(/16-byte salt/);
  });

  it('lets HKDF and EvpKDF run without one', async () => {
    for (const id of ['hkdf', 'evpkdf'] as const) {
      expect(KDFS[id].salt).toBe('optional');
      await expect(deriveKey(id, inputs(id, { salt: new Uint8Array(0) }))).resolves.toBeDefined();
    }
  });
});
