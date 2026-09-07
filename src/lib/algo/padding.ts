/**
 * Block-cipher padding.
 *
 * A block cipher only eats multiples of its block size. Padding is how a
 * message that is not that long becomes one, and how the original length is
 * recovered on the way back. The schemes differ in what they write into the
 * extra bytes, and in whether an already-aligned input still grows by a block
 * -- PKCS#7 always grows, zero-padding does not.
 *
 * Unpadding that cannot prove the input was padded that way throws, rather
 * than guessing. A padding oracle is how CBC without a MAC gets read, and
 * silent recovery is how one starts.
 */
export type PaddingId = 'pkcs7' | 'ansix923' | 'iso7816' | 'zero' | 'none';

export const PADDINGS: ReadonlyArray<{ value: PaddingId; label: string }> = [
  { value: 'pkcs7', label: 'PKCS#7' },
  { value: 'ansix923', label: 'ANSI X.923' },
  { value: 'iso7816', label: 'ISO/IEC 7816-4' },
  { value: 'zero', label: 'Zero' },
  { value: 'none', label: 'None' },
];

function assertBlockSize(blockSize: number): void {
  if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > 255) {
    throw new Error(`Padding needs a block size between 1 and 255 bytes; got ${blockSize}.`);
  }
}

/** Bytes of padding a scheme of this size would append to an input of `length`. */
export function padLength(length: number, blockSize: number, scheme: PaddingId): number {
  assertBlockSize(blockSize);
  if (scheme === 'none') return 0;
  const rem = length % blockSize;
  if (scheme === 'zero') return rem === 0 ? 0 : blockSize - rem;
  // PKCS#7, ANSI X.923 and ISO 7816-4 always add at least one byte, so an
  // already-aligned input grows by a whole block. That is what makes them
  // reversible: a trailing 0x08 on an 8-byte block is padding, not data.
  return rem === 0 ? blockSize : blockSize - rem;
}

export function pad(data: Uint8Array, blockSize: number, scheme: PaddingId): Uint8Array {
  assertBlockSize(blockSize);
  if (scheme === 'none') {
    if (data.length % blockSize !== 0) {
      throw new Error(
        `Input is ${data.length} bytes, which is not a multiple of the ${blockSize}-byte block. ` +
          'Choose a padding scheme, or pass an already-aligned value.',
      );
    }
    return data;
  }

  const extra = padLength(data.length, blockSize, scheme);
  if (extra === 0) return data;

  const out = new Uint8Array(data.length + extra);
  out.set(data);

  switch (scheme) {
    case 'pkcs7':
      out.fill(extra, data.length);
      break;
    case 'ansix923':
      out[out.length - 1] = extra;
      break;
    case 'iso7816':
      out[data.length] = 0x80;
      break;
    case 'zero':
      break;
  }
  return out;
}

/**
 * Apply padding around a raw block-cipher run: pad on the way in, unpad on
 * the way out. The ciphers themselves never see an unaligned block.
 */
export function withPadding(
  blockBytes: number,
  padding: PaddingId,
  data: Uint8Array,
  direction: 'encrypt' | 'decrypt',
  run: (aligned: Uint8Array) => Uint8Array,
): Uint8Array {
  if (direction === 'encrypt') return run(pad(data, blockBytes, padding));
  return unpad(run(data), blockBytes, padding);
}

export function unpad(data: Uint8Array, blockSize: number, scheme: PaddingId): Uint8Array {
  assertBlockSize(blockSize);
  if (scheme === 'none' || scheme === 'zero') {
    if (scheme === 'none' && data.length % blockSize !== 0) {
      throw new Error(
        `Ciphertext is ${data.length} bytes, which is not a multiple of the ${blockSize}-byte block.`,
      );
    }
    if (scheme === 'zero') {
      // Lossy by design: a message that ended in zeros is indistinguishable
      // from one that was padded. The page says so.
      let end = data.length;
      while (end > 0 && data[end - 1] === 0) end--;
      return data.subarray(0, end);
    }
    return data;
  }

  if (data.length === 0 || data.length % blockSize !== 0) {
    throw new Error(
      `Ciphertext is ${data.length} bytes, which is not a multiple of the ${blockSize}-byte block.`,
    );
  }

  if (scheme === 'iso7816') {
    let i = data.length - 1;
    while (i >= 0 && data[i] === 0) i--;
    if (i < 0 || data[i] !== 0x80) {
      throw new Error('Ciphertext does not end in ISO/IEC 7816-4 padding (0x80 followed by zeros).');
    }
    const extra = data.length - i;
    if (extra < 1 || extra > blockSize) {
      throw new Error('ISO/IEC 7816-4 padding is longer than a block.');
    }
    return data.subarray(0, i);
  }

  const extra = data[data.length - 1]!;
  if (extra < 1 || extra > blockSize || extra > data.length) {
    throw new Error(`Padding length ${extra} is not valid for a ${blockSize}-byte block.`);
  }

  const start = data.length - extra;
  if (scheme === 'pkcs7') {
    for (let i = start; i < data.length; i++) {
      if (data[i] !== extra) {
        throw new Error('Ciphertext is not PKCS#7 padded: a padding byte does not match the length.');
      }
    }
  } else {
    for (let i = start; i < data.length - 1; i++) {
      if (data[i] !== 0) {
        throw new Error('Ciphertext is not ANSI X.923 padded: the bytes before the length are not zero.');
      }
    }
  }
  return data.subarray(0, start);
}
