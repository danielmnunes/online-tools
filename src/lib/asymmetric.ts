/**
 * RSA and ECDSA, via the Web Crypto API.
 *
 * Key generation, OAEP, PSS, PKCS#1 v1.5 signatures and ECDSA are all
 * primitives the browser already has, and rolling them by hand is how the
 * classic mistakes (PKCS#1 v1.5 encryption, a DER/raw ECDSA mix-up, a nonce
 * reuse) get made. The page therefore calls SubtleCrypto and spends its
 * energy on the formats people paste: PEM and JWK.
 *
 * PKCS#1 v1.5 *encryption* is not offered. Web Crypto does not have it, and
 * it is deprecated. Signatures still offer RSASSA-PKCS1-v1_5 because that is
 * what JWTs and a great deal of existing data use.
 */
import { DecodeError } from './encoding';
import { derToPem, isJwk, parsePem } from './pem';

export type RsaModulus = 2048 | 3072 | 4096;
export type EcCurve = 'P-256' | 'P-384' | 'P-521';
export type HashAlg = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
export type RsaSignPadding = 'pkcs1' | 'pss';
export type KeyFormat = 'pem' | 'jwk';

export interface KeyPairText {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly format: KeyFormat;
}

export function canUseSubtle(): boolean {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

function requireSubtle(): SubtleCrypto {
  if (!canUseSubtle()) {
    throw new Error('This browser does not expose the Web Crypto API, so nothing can be done here.');
  }
  return crypto.subtle;
}

function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes.slice() as Uint8Array<ArrayBuffer>;
}

export async function generateRsaKeyPair(
  modulus: RsaModulus,
  format: KeyFormat,
): Promise<KeyPairText> {
  const subtle = requireSubtle();
  const pair = await subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: modulus,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  return exportPair(pair, format);
}

export async function generateEcdsaKeyPair(curve: EcCurve, format: KeyFormat): Promise<KeyPairText> {
  const subtle = requireSubtle();
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: curve }, true, [
    'sign',
    'verify',
  ]);
  return exportPair(pair, format);
}

async function exportPair(pair: CryptoKeyPair, format: KeyFormat): Promise<KeyPairText> {
  const subtle = requireSubtle();
  if (format === 'jwk') {
    const privateJwk = await subtle.exportKey('jwk', pair.privateKey);
    const publicJwk = await subtle.exportKey('jwk', pair.publicKey);
    return {
      format,
      privateKey: JSON.stringify(privateJwk, null, 2),
      publicKey: JSON.stringify(publicJwk, null, 2),
    };
  }
  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey));
  const spki = new Uint8Array(await subtle.exportKey('spki', pair.publicKey));
  return {
    format,
    privateKey: derToPem('PRIVATE KEY', pkcs8),
    publicKey: derToPem('PUBLIC KEY', spki),
  };
}

function rsaOaepParams(hash: HashAlg): RsaHashedImportParams {
  return { name: 'RSA-OAEP', hash };
}

function rsaSignParams(padding: RsaSignPadding, hash: HashAlg): RsaHashedImportParams {
  return { name: padding === 'pss' ? 'RSA-PSS' : 'RSASSA-PKCS1-v1_5', hash };
}

function pssSignAlgorithm(hash: HashAlg): RsaPssParams {
  const saltLength = hash === 'SHA-1' ? 20 : hash === 'SHA-256' ? 32 : hash === 'SHA-384' ? 48 : 64;
  return { name: 'RSA-PSS', saltLength };
}

async function importPublic(
  material: string,
  params: RsaHashedImportParams | EcKeyImportParams,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const trimmed = material.trim();
  if (trimmed === '') throw new DecodeError('Paste a public key: a PEM block or a JWK.');
  if (isJwk(trimmed)) {
    return subtle.importKey('jwk', JSON.parse(trimmed) as JsonWebKey, params, false, usages);
  }
  const { der, label } = parsePem(trimmed);
  if (label !== 'PUBLIC KEY') {
    throw new DecodeError(
      `that PEM block is labelled ${label}. A public key has to start with -----BEGIN PUBLIC KEY-----.`,
    );
  }
  return subtle.importKey('spki', copy(der), params, false, usages);
}

async function importPrivate(
  material: string,
  params: RsaHashedImportParams | EcKeyImportParams,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const trimmed = material.trim();
  if (trimmed === '') throw new DecodeError('Paste a private key: a PKCS#8 PEM block or a JWK.');
  if (isJwk(trimmed)) {
    return subtle.importKey('jwk', JSON.parse(trimmed) as JsonWebKey, params, false, usages);
  }
  const { der, label } = parsePem(trimmed);
  if (label !== 'PRIVATE KEY') {
    throw new DecodeError(
      `that PEM block is labelled ${label}. A private key has to start with -----BEGIN PRIVATE KEY----- ` +
        '(PKCS#8), not BEGIN RSA PRIVATE KEY.',
    );
  }
  return subtle.importKey('pkcs8', copy(der), params, false, usages);
}

export async function rsaEncrypt(
  publicKey: string,
  data: Uint8Array,
  hash: HashAlg,
): Promise<Uint8Array> {
  const key = await importPublic(publicKey, rsaOaepParams(hash), ['encrypt']);
  try {
    return new Uint8Array(await requireSubtle().encrypt({ name: 'RSA-OAEP' }, key, copy(data)));
  } catch (error) {
    throw new Error(
      `RSA-OAEP encryption failed. The message may be longer than this key allows ` +
        `(for SHA-256 on a 2048-bit key that is 190 bytes), or the key may not match. ` +
        `${error instanceof Error ? error.message : ''}`.trim(),
    );
  }
}

export async function rsaDecrypt(
  privateKey: string,
  data: Uint8Array,
  hash: HashAlg,
): Promise<Uint8Array> {
  const key = await importPrivate(privateKey, rsaOaepParams(hash), ['decrypt']);
  try {
    return new Uint8Array(await requireSubtle().decrypt({ name: 'RSA-OAEP' }, key, copy(data)));
  } catch (error) {
    throw new Error(
      `RSA-OAEP decryption failed. The key, the hash or the ciphertext does not match. ` +
        `${error instanceof Error ? error.message : ''}`.trim(),
    );
  }
}

export async function rsaSign(
  privateKey: string,
  data: Uint8Array,
  hash: HashAlg,
  padding: RsaSignPadding,
): Promise<Uint8Array> {
  const key = await importPrivate(privateKey, rsaSignParams(padding, hash), ['sign']);
  const algorithm =
    padding === 'pss' ? pssSignAlgorithm(hash) : { name: 'RSASSA-PKCS1-v1_5' };
  return new Uint8Array(await requireSubtle().sign(algorithm, key, copy(data)));
}

export async function rsaVerify(
  publicKey: string,
  data: Uint8Array,
  signature: Uint8Array,
  hash: HashAlg,
  padding: RsaSignPadding,
): Promise<boolean> {
  const key = await importPublic(publicKey, rsaSignParams(padding, hash), ['verify']);
  const algorithm =
    padding === 'pss' ? pssSignAlgorithm(hash) : { name: 'RSASSA-PKCS1-v1_5' };
  return requireSubtle().verify(algorithm, key, copy(signature), copy(data));
}

export async function ecdsaSign(
  privateKey: string,
  data: Uint8Array,
  hash: HashAlg,
  curve: EcCurve,
): Promise<Uint8Array> {
  const key = await importPrivate(privateKey, { name: 'ECDSA', namedCurve: curve }, ['sign']);
  return new Uint8Array(
    await requireSubtle().sign({ name: 'ECDSA', hash }, key, copy(data)),
  );
}

export async function ecdsaVerify(
  publicKey: string,
  data: Uint8Array,
  signature: Uint8Array,
  hash: HashAlg,
  curve: EcCurve,
): Promise<boolean> {
  const key = await importPublic(publicKey, { name: 'ECDSA', namedCurve: curve }, ['verify']);
  return requireSubtle().verify({ name: 'ECDSA', hash }, key, copy(signature), copy(data));
}
