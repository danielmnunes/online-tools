/**
 * Metadata for RSA and ECDSA.
 *
 * No crypto is imported here: the registry and the Astro pages read this at
 * build time. The operations each algorithm actually has are what generate
 * the pages -- ECDSA has no encrypt, because ECIES is a different construction
 * and this site does not pretend otherwise.
 */

export type AsymmetricId = 'rsa' | 'ecdsa';

export type AsymmetricOp = 'keygen' | 'encrypt' | 'decrypt' | 'sign' | 'verify';

export interface AsymmetricPage {
  readonly name: string;
  readonly title: string;
  readonly keywords: ReadonlyArray<string>;
  readonly blurb: string;
}

export interface AsymmetricMeta {
  readonly id: AsymmetricId;
  readonly label: string;
  readonly operations: ReadonlyArray<AsymmetricOp>;
  readonly pages: Readonly<Record<AsymmetricOp, AsymmetricPage | undefined>>;
  readonly warning: string;
  readonly keywords: ReadonlyArray<string>;
}

const KEYGEN_WARNING =
  'A private key generated in this browser is as good as the entropy the browser has, and as ' +
  'private as this tab. Generate long-term keys on the machine that will hold them. Treat this ' +
  'page as a way to see the format, not as a way to mint an identity.';

export const ASYMMETRIC: Readonly<Record<AsymmetricId, AsymmetricMeta>> = {
  rsa: {
    id: 'rsa',
    label: 'RSA',
    operations: ['keygen', 'encrypt', 'decrypt', 'sign', 'verify'],
    pages: {
      keygen: {
        name: 'RSA keygen',
        title: 'RSA Key Generator',
        keywords: ['rsa keygen', 'generate rsa key', 'rsa key pair', 'pkcs8'],
        blurb: 'A PKCS#8 private key and an SPKI public key, generated in this browser.',
      },
      encrypt: {
        name: 'RSA encrypt',
        title: 'RSA Encrypt',
        keywords: ['rsa encrypt', 'rsa-oaep', 'public key encrypt'],
        blurb: 'RSA-OAEP. PKCS#1 v1.5 encryption is not offered: it is deprecated, and the browser does not have it.',
      },
      decrypt: {
        name: 'RSA decrypt',
        title: 'RSA Decrypt',
        keywords: ['rsa decrypt', 'rsa-oaep', 'private key decrypt'],
        blurb: 'RSA-OAEP decryption with a PKCS#8 private key or a JWK.',
      },
      sign: {
        name: 'RSA sign',
        title: 'RSA Sign',
        keywords: ['rsa sign', 'rsassa-pkcs1', 'rsa-pss', 'rsa signature'],
        blurb: 'RSASSA-PKCS1-v1_5 or RSA-PSS, over the bytes of the message.',
      },
      verify: {
        name: 'RSA verify',
        title: 'RSA Verify',
        keywords: ['rsa verify', 'rsassa-pkcs1', 'rsa-pss', 'check signature'],
        blurb: 'Check an RSA signature against a public key.',
      },
    },
    warning: KEYGEN_WARNING,
    keywords: ['rsa', 'oaep', 'pss', 'pkcs1', 'rfc 8017'],
  },
  ecdsa: {
    id: 'ecdsa',
    label: 'ECDSA',
    operations: ['keygen', 'sign', 'verify'],
    pages: {
      keygen: {
        name: 'ECDSA keygen',
        title: 'ECDSA Key Generator',
        keywords: ['ecdsa keygen', 'generate ecdsa key', 'p-256', 'p-384', 'p-521'],
        blurb: 'A P-256, P-384 or P-521 key pair, generated in this browser.',
      },
      encrypt: undefined,
      decrypt: undefined,
      sign: {
        name: 'ECDSA sign',
        title: 'ECDSA Sign',
        keywords: ['ecdsa sign', 'p-256 sign', 'ieee p1363'],
        blurb: 'Signature is r and s concatenated (IEEE P1363), which is what JWT and Web Crypto use — not DER.',
      },
      verify: {
        name: 'ECDSA verify',
        title: 'ECDSA Verify',
        keywords: ['ecdsa verify', 'p-256 verify', 'check signature'],
        blurb: 'Check an ECDSA signature against a public key. r and s concatenated, not DER.',
      },
    },
    warning: KEYGEN_WARNING,
    keywords: ['ecdsa', 'p-256', 'p-384', 'p-521', 'fips 186-5'],
  },
};

export const ASYMMETRIC_IDS = Object.keys(ASYMMETRIC) as AsymmetricId[];

export function isAsymmetricId(value: string): value is AsymmetricId {
  return Object.hasOwn(ASYMMETRIC, value);
}

export function asymmetricSlug(id: AsymmetricId, op: AsymmetricOp): string {
  return `${id}/${op}`;
}

export const RSA_MODULUS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '2048', label: '2048 bits' },
  { value: '3072', label: '3072 bits' },
  { value: '4096', label: '4096 bits' },
];

export const EC_CURVES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'P-256', label: 'P-256' },
  { value: 'P-384', label: 'P-384' },
  { value: 'P-521', label: 'P-521' },
];

export const HASH_ALGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'SHA-256', label: 'SHA-256' },
  { value: 'SHA-384', label: 'SHA-384' },
  { value: 'SHA-512', label: 'SHA-512' },
  { value: 'SHA-1', label: 'SHA-1 (legacy)' },
];

export const RSA_SIGN_PADDINGS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pkcs1', label: 'RSASSA-PKCS1-v1_5' },
  { value: 'pss', label: 'RSA-PSS' },
];

export const KEY_FORMATS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'pem', label: 'PEM' },
  { value: 'jwk', label: 'JWK' },
];
