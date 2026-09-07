/**
 * RC4, written from the original description.
 *
 * There is no RC4 in the Web Crypto API, and @noble/ciphers does not ship one.
 * The algorithm is twenty lines and is verified against RFC 6229 and against
 * OpenSSL, which share no code with this file.
 *
 * Encryption and decryption are the same function: XOR with the keystream.
 * The first bytes of that keystream are biased, which is why TLS forbade RC4
 * in 2015 and why this page exists to read old ciphertext, not to produce new.
 */

function keystream(key: Uint8Array, length: number): Uint8Array {
  if (key.length < 1 || key.length > 256) {
    throw new Error(`RC4 needs a key of 1 to 256 bytes; got ${key.length}.`);
  }
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;

  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 0xff;
    const tmp = s[i]!;
    s[i] = s[j]!;
    s[j] = tmp;
  }

  const out = new Uint8Array(length);
  let i = 0;
  j = 0;
  for (let n = 0; n < length; n++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]!) & 0xff;
    const tmp = s[i]!;
    s[i] = s[j]!;
    s[j] = tmp;
    out[n] = s[(s[i]! + s[j]!) & 0xff]!;
  }
  return out;
}

/** XOR `data` with the RC4 keystream of `key`. Encrypt and decrypt are this. */
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const stream = keystream(key, data.length);
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i]! ^ stream[i]!;
  return out;
}
