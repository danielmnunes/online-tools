/**
 * JSON Web Tokens.
 *
 * The published vector is RFC 7515 §A.1, whose signature is reproducible from
 * the key in the RFC -- and is reproduced here, rather than assumed: the test
 * computes the HMAC itself and compares.
 *
 * Everything else is signed in the test with node:crypto and verified through
 * this module, which is the arrangement worth having: the signing side is an
 * independent implementation, the verifying side is the code under test, and
 * they share nothing but the format. Tokens are then tampered with, because a
 * verifier that cannot tell a changed token from a good one is not verifying
 * anything.
 */
import { createHmac, generateKeyPairSync, sign as nodeSign, type KeyObject } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { claimTiming, decodeJwt, pemToDer, timings, verifyJwt } from '~/lib/jwt';
import { DecodeError } from '~/lib/encoding';

/** RFC 7515 §A.1: a JWS with HS256, and the 64-byte key it was made with. */
const A1_TOKEN =
  'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
  '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
  '.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const A1_KEY = 'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow';

/** The digest an algorithm name implies, which is what JWA §3 ties together. */
const digestFor = (alg: string): string =>
  alg.endsWith('384') ? 'sha384' : alg.endsWith('512') ? 'sha512' : 'sha256';

const b64url = (value: string | Buffer): string =>
  Buffer.isBuffer(value) ? value.toString('base64url') : Buffer.from(value).toString('base64url');

function token(header: unknown, payload: unknown, signer: (input: string) => Buffer): string {
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${input}.${b64url(signer(input))}`;
}

function hmacToken(header: unknown, payload: unknown, secret: Buffer, digest: string): string {
  return token(header, payload, (input) => createHmac(digest, secret).update(input).digest());
}

const secretOf = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'utf8'));

/**
 * node:crypto signs ECDSA in DER; JWS §3.4 writes r and s concatenated, each
 * padded to the curve size. This is the conversion the signing side needs, and
 * the module does the opposite one on the way back.
 */
function derToRaw(der: Uint8Array, half: number): Buffer {
  let at = 1; // past the SEQUENCE tag
  const readLength = (): number => {
    const first = der[at++]!;
    if (first < 0x80) return first;
    let length = 0;
    for (let i = 0; i < (first & 0x7f); i++) length = (length << 8) | der[at++]!;
    return length;
  };
  readLength();

  const readInteger = (): number[] => {
    if (der[at++] !== 0x02) throw new Error('expected an INTEGER');
    const length = readLength();
    const bytes = [...der.subarray(at, at + length)];
    at += length;
    // DER integers are signed and minimal, so they may be short or carry a
    // leading zero; the fixed-width form wants neither.
    while (bytes.length > half) bytes.shift();
    while (bytes.length < half) bytes.unshift(0);
    return bytes;
  };

  return Buffer.from([...readInteger(), ...readInteger()]);
}

describe('decoding', () => {
  it('reads the RFC 7515 §A.1 token', () => {
    const decoded = decodeJwt(A1_TOKEN);
    expect(decoded.algorithm).toBe('HS256');
    expect(decoded.header.typ).toBe('JWT');
    expect(decoded.payload.iss).toBe('joe');
    expect(decoded.payload.exp).toBe(1300819380);
    expect(decoded.payload['http://example.com/is_root']).toBe(true);
    expect(decoded.signingInput).toBe(A1_TOKEN.slice(0, A1_TOKEN.lastIndexOf('.')));
  });

  it('reproduces that signature from the key in the RFC', async () => {
    // The point of a published vector: the HMAC is computed here, so the token
    // is checked against the specification rather than against itself.
    const expected = createHmac('sha256', Buffer.from(A1_KEY, 'base64url'))
      .update(decodeJwt(A1_TOKEN).signingInput)
      .digest('base64url');
    expect(expected).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');

    const result = await verifyJwt(decodeJwt(A1_TOKEN), { secret: new Uint8Array(Buffer.from(A1_KEY, 'base64url')) });
    expect(result.verified).toBe(true);
    expect(result.algorithm).toBe('HS256');
  });

  it('shows the header and payload as JSON rather than as a blob', () => {
    const decoded = decodeJwt(A1_TOKEN);
    expect(JSON.parse(decoded.headerJson)).toEqual({ typ: 'JWT', alg: 'HS256' });
    expect(JSON.parse(decoded.payloadJson)).toMatchObject({ iss: 'joe' });
  });

  it('takes the Bearer prefix off a pasted Authorization header', () => {
    expect(decodeJwt(`Bearer ${A1_TOKEN}`).token).toBe(A1_TOKEN);
  });

  it('refuses something that is not three segments', () => {
    expect(() => decodeJwt('only.two')).toThrow(DecodeError);
    expect(() => decodeJwt('')).toThrow(/Paste a token/);
  });

  it('says which segment is broken', () => {
    const segments = A1_TOKEN.split('.');
    expect(() => decodeJwt(`${segments[0]}.${segments[1]}`)).toThrow(/three segments/);
    expect(() => decodeJwt(`${segments[0]}.!!!!.sig`)).toThrow(/payload segment is not valid Base64URL/);
    expect(() => decodeJwt(`${b64url('"not an object"')}.${b64url('{}')}.sig`)).toThrow(
      /header segment is not JSON/,
    );
  });
});

describe('verifying an HMAC signature', () => {
  const secret = secretOf('a shared secret');

  it('accepts a token signed with the same secret', async () => {
    const jwt = hmacToken({ alg: 'HS256', typ: 'JWT' }, { sub: 'a' }, Buffer.from(secret), 'sha256');
    const result = await verifyJwt(decodeJwt(jwt), { secret });
    expect(result.verified).toBe(true);
    expect(result.detail).toMatch(/Checked as HS256/);
  });

  it('rejects the wrong secret', async () => {
    const jwt = hmacToken({ alg: 'HS256' }, { sub: 'a' }, Buffer.from(secret), 'sha256');
    const result = await verifyJwt(decodeJwt(jwt), { secret: secretOf('another secret') });
    expect(result.verified).toBe(false);
    expect(result.detail).toMatch(/does not verify/);
  });

  it('rejects a token whose payload was changed after signing', async () => {
    const jwt = hmacToken({ alg: 'HS256' }, { sub: 'user', admin: false }, Buffer.from(secret), 'sha256');
    const segments = jwt.split('.');
    const forged = `${segments[0]}.${b64url(JSON.stringify({ sub: 'user', admin: true }))}.${segments[2]}`;
    const result = await verifyJwt(decodeJwt(forged), { secret });
    expect(result.verified).toBe(false);
  });

  it('rejects a token that claims a different algorithm than it was signed with', async () => {
    // The algorithm in the header is a claim, not a fact. Signing with SHA-384
    // and labelling it HS256 has to fail, which it does because the label
    // chooses what the verifier computes.
    const jwt = hmacToken({ alg: 'HS384' }, { sub: 'a' }, Buffer.from(secret), 'sha384');
    const segments = jwt.split('.');
    const relabelled = `${b64url(JSON.stringify({ alg: 'HS256' }))}.${segments[1]}.${segments[2]}`;
    expect((await verifyJwt(decodeJwt(relabelled), { secret })).verified).toBe(false);
    expect((await verifyJwt(decodeJwt(jwt), { secret })).verified).toBe(true);
  });

  it('handles HS384 and HS512', async () => {
    for (const alg of ['HS384', 'HS512'] as const) {
      const jwt = hmacToken({ alg }, { sub: 'a' }, Buffer.from(secret), digestFor(alg));
      expect((await verifyJwt(decodeJwt(jwt), { secret })).verified, alg).toBe(true);
    }
  });

  it('asks for the secret instead of failing', async () => {
    const jwt = hmacToken({ alg: 'HS256' }, { sub: 'a' }, Buffer.from(secret), 'sha256');
    const result = await verifyJwt(decodeJwt(jwt), {});
    expect(result.verified).toBe(false);
    expect(result.detail).toMatch(/shared secret/);
  });
});

describe('verifying an asymmetric signature', () => {
  const data = { sub: 'a', iss: 'https://example.com' };

  function signed(
    alg: string,
    keypair: { privateKey: KeyObject; publicKey: KeyObject },
    signer: (input: string) => Buffer = (input) =>
      nodeSign(digestFor(alg), Buffer.from(input), keypair.privateKey),
  ): { jwt: string; pem: string; jwk: JsonWebKey } {
    const jwt = token({ alg }, data, (input) => {
      const signature = signer(input);
      // r and s, each padded to the curve size: 32 bytes for P-256, 48 for
      // P-384 and 66 for P-521.
      const half = alg === 'ES256' ? 32 : alg === 'ES384' ? 48 : 66;
      return alg.startsWith('ES') ? derToRaw(new Uint8Array(signature), half) : signature;
    });
    return {
      jwt,
      pem: keypair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      jwk: keypair.publicKey.export({ format: 'jwk' }) as JsonWebKey,
    };
  }

  it('verifies RS256 against a public key', async () => {
    const keypair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const { jwt, pem } = signed('RS256', keypair);
    const result = await verifyJwt(decodeJwt(jwt), { publicKey: pem });
    expect(result.verified).toBe(true);
    expect(result.algorithm).toBe('RS256');
  });

  it('rejects an RS256 token under the wrong public key', async () => {
    const keypair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const { jwt } = signed('RS256', keypair);
    const pem = other.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect((await verifyJwt(decodeJwt(jwt), { publicKey: pem })).verified).toBe(false);
  });

  it('verifies PS256, whose salt length the specification fixes', async () => {
    const keypair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const { jwt, pem } = signed('PS256', keypair, (input) =>
      nodeSign('sha256', Buffer.from(input), {
        key: keypair.privateKey,
        padding: 6, // RSA_PKCS1_PSS_PADDING
        saltLength: 32, // RSA_PSS_SALTLEN_DIGEST
      }),
    );
    const result = await verifyJwt(decodeJwt(jwt), { publicKey: pem });
    expect(result.verified).toBe(true);
    expect(result.algorithm).toBe('PS256');
  });

  // RFC 7518 §3.4: ES256 is P-256, ES384 is P-384, and ES512 is P-521. The
  // last one is the easiest thing in the file to get wrong, because there is
  // no P-512 curve and the name invites one.
  const CURVES = [
    ['ES256', 'P-256', 64],
    ['ES384', 'P-384', 96],
    ['ES512', 'P-521', 132],
  ] as const;

  it('verifies every ECDSA algorithm, whose signatures JWS writes in the form Web Crypto wants', async () => {
    for (const [alg, curve, length] of CURVES) {
      const keypair = generateKeyPairSync('ec', { namedCurve: curve });
      const { jwt, pem } = signed(alg, keypair);
      const decoded = decodeJwt(jwt);

      // RFC 7515 §3.4 writes r and s concatenated at a fixed width;
      // node:crypto signs into a DER SEQUENCE, so the signing side converts
      // here. The verifying side must not convert again -- ECDSA in the Web
      // Crypto API takes the raw form, and wrapping it is the usual interop
      // bug.
      expect(decoded.signature, alg).toHaveLength(length);
      const result = await verifyJwt(decoded, { publicKey: pem });
      expect(result.verified, `${alg}: ${result.detail}`).toBe(true);
      expect(result.algorithm, alg).toBe(alg);
    }
  });

  it('rejects an ECDSA signature with one bit changed', async () => {
    const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const { jwt, pem } = signed('ES256', keypair);
    const segments = jwt.split('.');
    const bytes = Buffer.from(segments[2] ?? '', 'base64url');
    bytes[10] ^= 0x01;
    const tampered = `${segments[0]}.${segments[1]}.${bytes.toString('base64url')}`;
    expect((await verifyJwt(decodeJwt(tampered), { publicKey: pem })).verified).toBe(false);
  });

  it('accepts a public key as a JWK, which is what a JWKS endpoint publishes', async () => {
    const keypair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const { jwt, jwk } = signed('ES256', keypair);
    const result = await verifyJwt(decodeJwt(jwt), { publicKey: JSON.stringify(jwk) });
    expect(result.verified).toBe(true);
  });

  it('refuses a PKCS#1 key with the command that converts it', () => {
    const keypair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pkcs1 = keypair.publicKey
      .export({ type: 'pkcs1', format: 'pem' })
      .toString()
      .replace('BEGIN RSA PUBLIC KEY', 'BEGIN RSA PUBLIC KEY');
    expect(() => pemToDer(pkcs1)).toThrow(/openssl rsa/);
  });

  it('asks for a public key rather than reporting a failure', async () => {
    const keypair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const { jwt } = signed('RS256', keypair);
    const result = await verifyJwt(decodeJwt(jwt), {});
    expect(result.verified).toBe(false);
    expect(result.detail).toMatch(/Paste the public key/);
  });
});

describe('alg: none', () => {
  it('says there is nothing to check rather than checking nothing', async () => {
    const jwt = `${b64url(JSON.stringify({ alg: 'none' }))}.${b64url(JSON.stringify({ sub: 'a' }))}.`;
    const result = await verifyJwt(decodeJwt(jwt), {});
    expect(result.verified).toBe(false);
    expect(result.detail).toMatch(/unsigned/);
  });

  it('reports a signature that the header promises but the token lacks', async () => {
    const jwt = `${b64url(JSON.stringify({ alg: 'HS256' }))}.${b64url(JSON.stringify({ sub: 'a' }))}.`;
    const result = await verifyJwt(decodeJwt(jwt), { secret: secretOf('x') });
    expect(result.verified).toBe(false);
    expect(result.detail).toMatch(/third segment is empty/);
  });
});

describe('time claims', () => {
  const now = 1_700_000_000;

  it('reads exp as a distance, not just a date', () => {
    const expired = claimTiming('exp', now - 3 * 86400, now);
    expect(expired.state).toBe('past');
    expect(expired.relative).toBe('expired 3 days ago');
    expect(expired.date.toISOString()).toBe(new Date((now - 3 * 86400) * 1000).toISOString());

    const valid = claimTiming('exp', now + 12 * 60, now);
    expect(valid.state).toBe('future');
    expect(valid.relative).toBe('expires in 12 minutes');
  });

  it('lists the claims a token carries, in the order they apply', () => {
    const payload = { iat: now - 3600, nbf: now - 60, exp: now + 3600 };
    expect(timings(payload, now).map((timing) => timing.claim)).toEqual(['iat', 'nbf', 'exp']);
  });

  it('says nothing about claims that are not there', () => {
    expect(timings({ sub: 'a' }, now)).toEqual([]);
    // A milliseconds timestamp is three orders of magnitude out, and reading
    // it as seconds would put the expiry fifty thousand years away.
    const bogus = { exp: 'not a number' } as unknown as Parameters<typeof timings>[0];
    expect(timings(bogus, now)).toEqual([]);
  });
});
