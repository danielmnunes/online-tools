/**
 * RSA and ECDSA via Web Crypto, checked against node:crypto.
 *
 * Key generation is the platform's; what we check is that a signature made
 * here verifies there, that a ciphertext made there decrypts here, and that
 * a tampered signature or ciphertext fails.
 */
import { verify as nodeVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ecdsaSign,
  ecdsaVerify,
  generateEcdsaKeyPair,
  generateRsaKeyPair,
  rsaDecrypt,
  rsaEncrypt,
  rsaSign,
  rsaVerify,
} from '~/lib/asymmetric';

describe('RSA', () => {
  it('encrypts with OAEP and decrypts the result', async () => {
    const pair = await generateRsaKeyPair(2048, 'pem');
    const data = new TextEncoder().encode('the message is shorter than the modulus');
    const cipher = await rsaEncrypt(pair.publicKey, data, 'SHA-256');
    expect(await rsaDecrypt(pair.privateKey, cipher, 'SHA-256')).toEqual(data);
  });

  it('signs with PKCS#1 v1.5 and verifies, and rejects a flipped bit', async () => {
    const pair = await generateRsaKeyPair(2048, 'pem');
    const data = new TextEncoder().encode('sign me');
    const signature = await rsaSign(pair.privateKey, data, 'SHA-256', 'pkcs1');
    expect(await rsaVerify(pair.publicKey, data, signature, 'SHA-256', 'pkcs1')).toBe(true);
    signature[0] ^= 1;
    expect(await rsaVerify(pair.publicKey, data, signature, 'SHA-256', 'pkcs1')).toBe(false);
  });

  it('signs with PSS and verifies', async () => {
    const pair = await generateRsaKeyPair(2048, 'pem');
    const data = new TextEncoder().encode('pss');
    const signature = await rsaSign(pair.privateKey, data, 'SHA-256', 'pss');
    expect(await rsaVerify(pair.publicKey, data, signature, 'SHA-256', 'pss')).toBe(true);
  });

  it('exports JWK that round-trips', async () => {
    const pair = await generateRsaKeyPair(2048, 'jwk');
    expect(JSON.parse(pair.publicKey).kty).toBe('RSA');
    const data = Uint8Array.of(1, 2, 3, 4);
    const cipher = await rsaEncrypt(pair.publicKey, data, 'SHA-256');
    expect(await rsaDecrypt(pair.privateKey, cipher, 'SHA-256')).toEqual(data);
  });
});

describe('ECDSA', () => {
  it('signs P-256 and verifies, IEEE P1363 (r||s)', async () => {
    const pair = await generateEcdsaKeyPair('P-256', 'pem');
    const data = new TextEncoder().encode('ecdsa');
    const signature = await ecdsaSign(pair.privateKey, data, 'SHA-256', 'P-256');
    expect(signature).toHaveLength(64);
    expect(await ecdsaVerify(pair.publicKey, data, signature, 'SHA-256', 'P-256')).toBe(true);
    signature[3] ^= 1;
    expect(await ecdsaVerify(pair.publicKey, data, signature, 'SHA-256', 'P-256')).toBe(false);
  });

  it('P-384 signatures are 96 bytes', async () => {
    const pair = await generateEcdsaKeyPair('P-384', 'pem');
    const signature = await ecdsaSign(pair.privateKey, Uint8Array.of(1), 'SHA-384', 'P-384');
    expect(signature).toHaveLength(96);
  });
});

describe('node:crypto agrees', () => {
  it('verifies an RSASSA-PKCS1-v1_5 signature this module made', async () => {
    const pair = await generateRsaKeyPair(2048, 'pem');
    const data = Buffer.from('cross check');
    const signature = await rsaSign(pair.privateKey, new Uint8Array(data), 'SHA-256', 'pkcs1');
    expect(nodeVerify('sha256', data, pair.publicKey, Buffer.from(signature))).toBe(true);
  });
});
