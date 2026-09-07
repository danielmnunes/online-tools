/**
 * ECB and CBC, for the block ciphers that are not AES.
 *
 * AES has these in @noble/ciphers. DES, Triple DES and SPECK do not, so the
 * chaining lives here once rather than three times. The block function is
 * the only thing the cipher supplies.
 */
export type BlockFn = (block: Uint8Array) => Uint8Array;

function xorInto(out: Uint8Array, a: Uint8Array, b: Uint8Array): void {
  for (let i = 0; i < out.length; i++) out[i] = a[i]! ^ b[i]!;
}

function assertBlocks(data: Uint8Array, blockSize: number, what: string): void {
  if (data.length % blockSize !== 0) {
    throw new Error(
      `${what} is ${data.length} bytes, which is not a multiple of the ${blockSize}-byte block.`,
    );
  }
}

export function ecbEncrypt(encryptBlock: BlockFn, blockSize: number, data: Uint8Array): Uint8Array {
  assertBlocks(data, blockSize, 'Input');
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += blockSize) {
    out.set(encryptBlock(data.subarray(i, i + blockSize)), i);
  }
  return out;
}

export function ecbDecrypt(decryptBlock: BlockFn, blockSize: number, data: Uint8Array): Uint8Array {
  return ecbEncrypt(decryptBlock, blockSize, data);
}

export function cbcEncrypt(
  encryptBlock: BlockFn,
  blockSize: number,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  assertBlocks(data, blockSize, 'Input');
  if (iv.length !== blockSize) {
    throw new Error(`CBC needs a ${blockSize}-byte IV; got ${iv.length}.`);
  }
  const out = new Uint8Array(data.length);
  const mixed = new Uint8Array(blockSize);
  let prev = iv;
  for (let i = 0; i < data.length; i += blockSize) {
    xorInto(mixed, data.subarray(i, i + blockSize), prev);
    const cipher = encryptBlock(mixed);
    out.set(cipher, i);
    prev = cipher;
  }
  return out;
}

export function cbcDecrypt(
  decryptBlock: BlockFn,
  blockSize: number,
  iv: Uint8Array,
  data: Uint8Array,
): Uint8Array {
  assertBlocks(data, blockSize, 'Ciphertext');
  if (iv.length !== blockSize) {
    throw new Error(`CBC needs a ${blockSize}-byte IV; got ${iv.length}.`);
  }
  const out = new Uint8Array(data.length);
  const plain = new Uint8Array(blockSize);
  let prev = iv;
  for (let i = 0; i < data.length; i += blockSize) {
    const cipher = data.subarray(i, i + blockSize);
    xorInto(plain, decryptBlock(cipher), prev);
    out.set(plain, i);
    prev = cipher.slice();
  }
  return out;
}
