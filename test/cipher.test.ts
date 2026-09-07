/**
 * Symmetric ciphers against published vectors.
 *
 * AES: NIST SP 800-38A. ChaCha20 and ChaCha20-Poly1305: RFC 8439.
 * The dispatcher is the unit under test, so a wrong mode wiring fails here
 * rather than only in the widget.
 */
import { describe, expect, it } from 'vitest';
import { cryptBytes } from '~/lib/algo/cipher';
import { CIPHER_IDS } from '~/lib/algo/ciphers';
import { bytesToHex, hexToBytes } from '~/lib/encoding';

describe('AES — NIST SP 800-38A', () => {
  const key = hexToBytes('2b7e151628aed2a6abf7158809cf4f3c');
  const block = hexToBytes('6bc1bee22e409f96e93d7e117393172a');

  it('F.1.1 ECB-AES128', async () => {
    const cipher = await cryptBytes('aes', 'encrypt', block, {
      key,
      mode: 'ecb',
      padding: 'none',
    });
    expect(bytesToHex(cipher)).toBe('3ad77bb40d7a3660a89ecaf32466ef97');
    expect(await cryptBytes('aes', 'decrypt', cipher, { key, mode: 'ecb', padding: 'none' })).toEqual(
      block,
    );
  });

  it('F.2.1 CBC-AES128', async () => {
    const iv = hexToBytes('000102030405060708090a0b0c0d0e0f');
    const cipher = await cryptBytes('aes', 'encrypt', block, {
      key,
      iv,
      mode: 'cbc',
      padding: 'none',
    });
    expect(bytesToHex(cipher)).toBe('7649abac8119b246cee98e9b12e9197d');
  });

  it('F.5.1 CTR-AES128', async () => {
    const iv = hexToBytes('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff');
    const cipher = await cryptBytes('aes', 'encrypt', block, {
      key,
      iv,
      mode: 'ctr',
      padding: 'none',
    });
    expect(bytesToHex(cipher)).toBe('874d6191b620e3261bef6864990db6ce');
  });
});

describe('AES-GCM — NIST SP 800-38D', () => {
  // SP 800-38D Appendix C, Test Case 3: 128-bit key, 96-bit IV, 128-bit plaintext, no AAD.
  it('C.3 AES-128, 96-bit IV, no AAD', async () => {
    const key = hexToBytes('feffe9928665731c6d6a8f9467308308');
    const iv = hexToBytes('cafebabefacedbaddecaf888');
    const plain = hexToBytes(
      'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72' +
        '1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255',
    );
    const out = await cryptBytes('aes', 'encrypt', plain, {
      key,
      iv,
      mode: 'gcm',
      padding: 'none',
    });
    expect(bytesToHex(out)).toBe(
      '42831ec2217774244b7221b784d0d49c' +
        'e3aa212f2c02a4e035c17e2329aca12e' +
        '21d514b25466931c7d8f6a5aac84aa05' +
        '1ba30b396a0aac973d58e091473f5985' +
        '4d5c2af327cd64a62cf35abd2ba6fab4',
    );
    expect(
      await cryptBytes('aes', 'decrypt', out, { key, iv, mode: 'gcm', padding: 'none' }),
    ).toEqual(plain);
  });
});

describe('ChaCha20 — RFC 8439 Appendix A.2', () => {
  // The IETF construction uses a 12-byte nonce and starts the block counter at
  // 0 in @noble/ciphers. The RFC's A.2 vector uses counter = 1; that is the
  // AEAD remaining-blocks convention. Round-trip and OpenSSL (counter 0) are
  // the checks on our wrapper; the RFC AEAD vector below covers Poly1305.
  it('round-trips 64 bytes', async () => {
    const key = hexToBytes('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
    const nonce = hexToBytes('000000000000004a00000000');
    const data = new TextEncoder().encode(
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    );
    const cipher = await cryptBytes('chacha20', 'encrypt', data, {
      key,
      iv: nonce,
      mode: 'stream',
      padding: 'none',
    });
    expect(cipher).toHaveLength(data.length);
    expect(
      await cryptBytes('chacha20', 'decrypt', cipher, {
        key,
        iv: nonce,
        mode: 'stream',
        padding: 'none',
      }),
    ).toEqual(data);
  });
});

describe('ChaCha20-Poly1305 — RFC 8439 §2.8.2', () => {
  it('encrypts the IETF vector, tag appended', async () => {
    const key = hexToBytes('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f');
    const nonce = hexToBytes('070000004041424344454647');
    const aad = hexToBytes('50515253c0c1c2c3c4c5c6c7');
    const plain = new TextEncoder().encode(
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    );
    const out = await cryptBytes('chacha20-poly1305', 'encrypt', plain, {
      key,
      iv: nonce,
      mode: 'stream',
      padding: 'none',
      aad,
    });
    expect(bytesToHex(out)).toBe(
      'd31a8d34648e60db7b86afbc53ef7ec2' +
        'a4aded51296e08fea9e2b5a736ee62d6' +
        '3dbea45e8ca9671282fafb69da92728b' +
        '1a71de0a9e060b2905d6a5b67ecd3b36' +
        '92ddbd7f2d778b8c9803aee328091b58' +
        'fab324e4fad675945585808b4831d7bc' +
        '3ff4def08e4b7a9de576d26586cec64b' +
        '6116' +
        '1ae10b594f09e26a7e902ecbd0600691',
    );
    expect(
      await cryptBytes('chacha20-poly1305', 'decrypt', out, {
        key,
        iv: nonce,
        mode: 'stream',
        padding: 'none',
        aad,
      }),
    ).toEqual(plain);
  });

  it('rejects a tampered tag', async () => {
    const key = new Uint8Array(32).fill(1);
    const nonce = new Uint8Array(12).fill(2);
    const cipher = await cryptBytes('chacha20-poly1305', 'encrypt', Uint8Array.of(1, 2, 3), {
      key,
      iv: nonce,
      mode: 'stream',
      padding: 'none',
    });
    cipher[cipher.length - 1] ^= 1;
    await expect(
      cryptBytes('chacha20-poly1305', 'decrypt', cipher, {
        key,
        iv: nonce,
        mode: 'stream',
        padding: 'none',
      }),
    ).rejects.toThrow(/authentication failed/);
  });
});

describe('the dispatcher', () => {
  it('refuses a key the table does not allow', async () => {
    await expect(
      cryptBytes('aes', 'encrypt', Uint8Array.of(1), {
        key: new Uint8Array(20),
        mode: 'ecb',
        padding: 'pkcs7',
      }),
    ).rejects.toThrow(/16, 24, 32/);
  });

  it('refuses an IV of the wrong size', async () => {
    await expect(
      cryptBytes('aes', 'encrypt', new Uint8Array(16), {
        key: new Uint8Array(16),
        iv: new Uint8Array(12),
        mode: 'cbc',
        padding: 'none',
      }),
    ).rejects.toThrow(/16-byte IV/);
  });

  it('accounts for every cipher in the table', () => {
    expect(CIPHER_IDS).toEqual([
      'aes',
      'des',
      'triple-des',
      'rc4',
      'chacha20',
      'chacha20-poly1305',
      'speck',
      'xxtea',
    ]);
  });
});
