/**
 * JSON Web Tokens: read one, and check its signature.
 *
 * Decoding is deliberately separate from verifying, and the page shows them
 * that way round. A token is three Base64URL segments with a pair of JSON
 * objects in the first two; reading them is parsing, and parsing proves
 * nothing. The signature is the only part that says who wrote it, and it is
 * checked with the Web Crypto API rather than by hand, because a
 * hand-rolled comparison of two strings is how the classic `alg: none` and
 * timing attacks stay alive.
 *
 * Two things this module refuses to do quietly:
 *
 * - `alg: none` is reported as unverifiable rather than verified. A token with
 *   that header is an unauthenticated claim, and saying so is the whole point.
 * - Verification reports *which* algorithm it used. Checking a token against
 *   the algorithm named in its own header is the confusion attack: the caller
 *   gets the algorithm back so a mismatch can be seen.
 */
import { base64urlnopad } from '@scure/base';
import { DecodeError } from './encoding';

export interface JwtHeader {
  readonly alg?: string;
  readonly typ?: string;
  readonly kid?: string;
  readonly [key: string]: unknown;
}

export interface JwtClaims {
  readonly iss?: string;
  readonly sub?: string;
  readonly aud?: string | ReadonlyArray<string>;
  readonly exp?: number;
  readonly nbf?: number;
  readonly iat?: number;
  readonly jti?: string;
  readonly [key: string]: unknown;
}

export interface DecodedJwt {
  /** The three segments as they arrived, minus any "Bearer " prefix. */
  readonly token: string;
  readonly header: JwtHeader;
  readonly payload: JwtClaims;
  readonly headerJson: string;
  readonly payloadJson: string;
  /** `header.payload`, which is exactly what the signature covers. */
  readonly signingInput: string;
  readonly signature: Uint8Array;
  readonly algorithm: string;
  /** True when the third segment is empty, which only `alg: none` allows. */
  readonly unsigned: boolean;
}

export interface JwtVerification {
  readonly verified: boolean;
  readonly detail: string;
  /** The algorithm the signature was checked under, or undefined if none was. */
  readonly algorithm?: string;
}

export interface JwtKey {
  /** Shared secret, for HS256/384/512, in the bytes the encoding produced. */
  readonly secret?: Uint8Array;
  /** A public key: PEM (BEGIN PUBLIC KEY) or a JWK, for the asymmetric algorithms. */
  readonly publicKey?: string;
}

const HASH_BY_BITS: Readonly<Record<number, string>> = {
  256: 'SHA-256',
  384: 'SHA-384',
  512: 'SHA-512',
};

/** Bytes of `header.payload`: the exact octets the signature is over. */
export function signingInputBytes(decoded: DecodedJwt): Uint8Array {
  return new TextEncoder().encode(decoded.signingInput);
}

/** Parse and split a token. Throws DecodeError with something readable. */
export function decodeJwt(input: string): DecodedJwt {
  const token = input.trim().replace(/^Bearer\s+/i, '');
  if (token === '') throw new DecodeError('Paste a token to decode.');

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new DecodeError(
      `A token is three segments separated by dots; this one has ${parts.length}. ` +
        `Nothing here is decoded yet, so whatever was pasted has not been checked.`,
    );
  }

  const [headerPart = '', payloadPart = '', signaturePart = ''] = parts;

  const header = parseSegment<JwtHeader>(headerPart, 'header');
  const payload = parseSegment<JwtClaims>(payloadPart, 'payload');
  const signature = decodeSegment(signaturePart, 'signature');

  return {
    token,
    header,
    payload,
    headerJson: JSON.stringify(header, null, 2),
    payloadJson: JSON.stringify(payload, null, 2),
    signingInput: `${headerPart}.${payloadPart}`,
    signature,
    algorithm: typeof header.alg === 'string' ? header.alg : '',
    unsigned: signature.length === 0,
  };
}

function decodeSegment(segment: string, what: string): Uint8Array {
  if (segment === '') return new Uint8Array(0);
  try {
    return base64urlnopad.decode(segment);
  } catch {
    throw new DecodeError(`The ${what} segment is not valid Base64URL.`);
  }
}

function parseSegment<T>(segment: string, what: string): T {
  const bytes = decodeSegment(segment, what);
  if (bytes.length === 0) throw new DecodeError(`The ${what} segment is empty.`);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DecodeError(`The ${what} segment is not valid UTF-8.`);
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('it is not a JSON object');
    }
    return value as T;
  } catch (error) {
    throw new DecodeError(
      `The ${what} segment is not JSON: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/** A registered claim about time, read as both a date and a distance. */
export interface ClaimTiming {
  /** What the claim is called: exp, iat or nbf. */
  readonly claim: 'exp' | 'iat' | 'nbf';
  readonly seconds: number;
  readonly date: Date;
  /** "expired 3 days ago", "usable in 2 minutes", "issued 5 hours ago". */
  readonly relative: string;
  readonly state: 'past' | 'future';
}

/** Each pair is the divisor and the name of the unit it divides into. */
const UNITS: ReadonlyArray<readonly [number, string]> = [
  [60, 'minute'],
  [60, 'hour'],
  [24, 'day'],
  [30, 'month'],
  [12, 'year'],
];

/** "3 days", as a distance rather than a date, because that is the question. */
function distance(seconds: number): string {
  let value = Math.abs(seconds);
  let unit = 'second';
  for (const [step, name] of UNITS) {
    if (value < step * 2) break;
    value = Math.round(value / step);
    unit = name;
  }
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/**
 * Read a time claim against the clock.
 *
 * `exp` is the one that matters to a relying party, and it is the one people
 * get wrong: it is seconds since the epoch, not milliseconds, and it is a
 * point in time rather than a duration.
 */
export function claimTiming(claim: 'exp' | 'iat' | 'nbf', seconds: number, now: number): ClaimTiming {
  const state = seconds <= now ? 'past' : 'future';
  const phrases: Record<ClaimTiming['claim'], [string, string]> = {
    exp: ['expired', 'expires in'],
    iat: ['issued', 'issued in'],
    nbf: ['valid since', 'usable in'],
  };
  const [past, future] = phrases[claim];
  return {
    claim,
    seconds,
    date: new Date(seconds * 1000),
    relative: state === 'past' ? `${past} ${distance(now - seconds)} ago` : `${future} ${distance(seconds - now)}`,
    state,
  };
}

/** The registered time claims this token carries, oldest question first. */
export function timings(payload: JwtClaims, now: number): ReadonlyArray<ClaimTiming> {
  const out: ClaimTiming[] = [];
  for (const claim of ['iat', 'nbf', 'exp'] as const) {
    const value = payload[claim];
    // Seconds since the epoch, which is what RFC 7519 says and what a
    // milliseconds value pasted by accident looks nothing like: 1.7e9 versus
    // 1.7e12, three orders of magnitude and thirty thousand years apart.
    if (typeof value === 'number' && Number.isFinite(value)) out.push(claimTiming(claim, value, now));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function canVerify(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

/** The algorithm family, hash and curve behind a JWS `alg` value. */
function algorithmSpec(alg: string): {
  family: 'hmac' | 'rsa-pkcs1' | 'rsa-pss' | 'ecdsa';
  hash: string;
  curve?: string;
  saltLength?: number;
} {
  const match = /^(HS|RS|PS|ES)(256|384|512)$/.exec(alg);
  if (match === null) throw new Error(`"${alg}" is not an algorithm this page can check.`);
  const [, family = '', bits = '256'] = match;
  const hash = HASH_BY_BITS[Number.parseInt(bits, 10)]!;
  const size = Number.parseInt(bits, 10);

  switch (family) {
    case 'HS':
      return { family: 'hmac', hash };
    case 'RS':
      return { family: 'rsa-pkcs1', hash };
    case 'PS':
      // RFC 7518 §3.5: the salt length is the length of the hash, always.
      return { family: 'rsa-pss', hash, saltLength: size / 8 };
    default:
      return { family: 'ecdsa', hash, curve: `P-${bits}` };
  }
}

/**
 * Check the signature with the Web Crypto API.
 *
 * Returns rather than throws, because a failed verification is a normal
 * outcome and belongs on the page, while a broken key or an unsupported
 * algorithm is a different thing and is reported as one.
 */
export async function verifyJwt(decoded: DecodedJwt, key: JwtKey): Promise<JwtVerification> {
  if (!canVerify()) {
    return { verified: false, detail: 'This browser does not expose the Web Crypto API, so nothing can be checked here.' };
  }

  const alg = decoded.algorithm;
  if (alg === '' || alg === 'none') {
    return {
      verified: false,
      detail:
        'The header says the token is unsigned, so there is nothing to check. Anyone can write ' +
        'this token; a relying party that accepts it has no authentication at all.',
    };
  }
  if (decoded.unsigned) {
    return {
      verified: false,
      detail: `The header asks for ${alg} but the third segment is empty. A token whose signature is missing cannot be checked.`,
    };
  }

  let spec: ReturnType<typeof algorithmSpec>;
  try {
    spec = algorithmSpec(alg);
  } catch (error) {
    return { verified: false, detail: error instanceof Error ? error.message : String(error) };
  }

  try {
    const cryptoKey = await importKey(spec, key);
    if (cryptoKey === undefined) {
      return {
        verified: false,
        detail:
          spec.family === 'hmac'
            ? 'HS256, HS384 and HS512 are checked with a shared secret: paste it below.'
            : 'Paste the public key: a PEM block starting with -----BEGIN PUBLIC KEY-----, or a JWK.',
      };
    }

    const verified = await crypto.subtle.verify(
      spec.family === 'hmac'
        ? { name: 'HMAC', hash: spec.hash }
        : spec.family === 'ecdsa'
          ? { name: 'ECDSA', hash: spec.hash }
          : { name: spec.family === 'rsa-pss' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5', hash: spec.hash, ...(spec.saltLength !== undefined ? { saltLength: spec.saltLength } : {}) },
      cryptoKey,
      // Copies: some implementations reject a view over a larger buffer here.
      //
      // No conversion, and that is the point. RFC 7515 §3.4 writes an ECDSA
      // signature as r and s concatenated at a fixed width, and ECDSA in the
      // Web Crypto API takes exactly that -- IEEE P1363 -- rather than the DER
      // SEQUENCE that OpenSSL and node:crypto produce. The usual interop bug
      // here is the other way round: code that assumes DER and wraps what was
      // already raw.
      decoded.signature.slice(),
      signingInputBytes(decoded).slice(),
    );

    return {
      verified,
      algorithm: alg,
      detail: verified
        ? `Checked as ${alg} against the key below.`
        : `The signature does not verify under ${alg}. Either the token was changed after it was signed, or this is not the key that signed it.`,
    };
  } catch (error) {
    return {
      verified: false,
      detail: `Could not check the signature: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function importKey(
  spec: ReturnType<typeof algorithmSpec>,
  key: JwtKey,
): Promise<CryptoKey | undefined> {
  if (spec.family === 'hmac') {
    if (key.secret === undefined || key.secret.length === 0) return undefined;
    return crypto.subtle.importKey(
      'raw',
      key.secret.slice(),
      { name: 'HMAC', hash: spec.hash },
      false,
      ['verify'],
    );
  }

  const material = key.publicKey?.trim();
  if (material === undefined || material === '') return undefined;

  const params: EcKeyImportParams | RsaHashedImportParams =
    spec.family === 'ecdsa'
      ? { name: 'ECDSA', namedCurve: spec.curve! }
      : {
          name: spec.family === 'rsa-pss' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5',
          hash: spec.hash,
        };

  // A JWK is what a JWKS endpoint hands out, so it is accepted as well as PEM.
  if (material.startsWith('{')) {
    const jwk = JSON.parse(material) as JsonWebKey;
    return crypto.subtle.importKey('jwk', jwk, params, false, ['verify']);
  }

  return crypto.subtle.importKey('spki', pemToDer(material), params, false, ['verify']);
}

/**
 * The DER bytes out of a PEM block.
 *
 * Only the SubjectPublicKeyInfo form is accepted, which is what
 * -----BEGIN PUBLIC KEY----- wraps. The PKCS#1 form
 * (-----BEGIN RSA PUBLIC KEY-----) is a different structure and is much rarer
 * in this setting, so it is refused with the command that converts it rather
 * than parsed into something Web Crypto cannot import.
 */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const match =
    /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(pem.trim());
  if (match === null) {
    throw new Error(
      'that is not a PEM block. It has to start with -----BEGIN PUBLIC KEY----- and end with -----END PUBLIC KEY-----.',
    );
  }
  const [, label = '', body = ''] = match;
  if (label.includes('RSA PUBLIC KEY')) {
    throw new Error(
      'that is a PKCS#1 RSA public key. The browser wants the SubjectPublicKeyInfo form: ' +
        'openssl rsa -RSAPublicKey_in -pubin -out public.pem',
    );
  }

  const base64 = body.replace(/\s+/g, '');
  let binary: string;
  try {
    binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new Error('the base64 inside the PEM block does not decode.');
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
