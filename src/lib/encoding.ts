/**
 * Conversion between the text the user types and the bytes an algorithm eats.
 *
 * Every tool on this site is really "bytes in, bytes out"; the encoding
 * selects are what let someone hash the *bytes* `de:ad:be:ef` rather than the
 * *string* "deadbeef". Getting this layer right once means no tool has to
 * think about it again.
 */

export type InputEncoding =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'hex'
  | 'base64'
  | 'latin1';

export type OutputEncoding = 'hex' | 'hex-upper' | 'base64';

export const INPUT_ENCODINGS: ReadonlyArray<{ value: InputEncoding; label: string }> = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'utf-16le', label: 'UTF-16LE' },
  { value: 'utf-16be', label: 'UTF-16BE' },
  { value: 'latin1', label: 'Latin-1 (ISO-8859-1)' },
  { value: 'hex', label: 'Hex' },
  { value: 'base64', label: 'Base64' },
];

export const OUTPUT_ENCODINGS: ReadonlyArray<{ value: OutputEncoding; label: string }> = [
  { value: 'hex', label: 'Hex (lowercase)' },
  { value: 'hex-upper', label: 'Hex (uppercase)' },
  { value: 'base64', label: 'Base64' },
];

/** Thrown when the user's input does not parse as the encoding they picked. */
export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

const HEX_ALPHABET = '0123456789abcdef';

export function bytesToHex(bytes: Uint8Array, upper = false): string {
  let out = '';
  for (const b of bytes) {
    out += HEX_ALPHABET[b >> 4]! + HEX_ALPHABET[b & 0x0f]!;
  }
  return upper ? out.toUpperCase() : out;
}

export function hexToBytes(hex: string): Uint8Array {
  // Tolerate the shapes people actually paste: 0x prefixes, spaces, colons,
  // newlines from a hex dump.
  const cleaned = hex.replace(/0x/gi, '').replace(/[\s:_-]/g, '');
  if (cleaned.length === 0) return new Uint8Array(0);
  if (cleaned.length % 2 !== 0) {
    throw new DecodeError('Hex input must have an even number of digits.');
  }
  if (!/^[0-9a-f]*$/i.test(cleaned)) {
    throw new DecodeError('Hex input contains characters outside 0-9 and a-f.');
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  // Chunked so a large file does not blow the argument limit of String.fromCharCode.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  let binary: string;
  try {
    binary = atob(cleaned);
  } catch {
    throw new DecodeError('Input is not valid Base64.');
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Read a digest someone pasted, without asking them which encoding it is in.
 *
 * Published checksums and derived keys arrive as hex about as often as base64,
 * and asking the user to say which is asking them to look. Hex wins ties --
 * "abcd" parses as both, and a digest written in hex is the commoner case.
 */
export function bytesFromAnyEncoding(text: string): Uint8Array {
  const cleaned = text.trim().replace(/\s/g, '');
  if (cleaned === '') throw new DecodeError('Nothing to decode.');
  if (cleaned.length % 2 === 0 && /^[0-9a-f]+$/i.test(cleaned)) return hexToBytes(cleaned);
  return base64ToBytes(cleaned);
}

function utf16ToBytes(text: string, littleEndian: boolean): Uint8Array {
  // Iterate code units, not code points: surrogate pairs must survive as the
  // two units they are, which is what UTF-16 on the wire means.
  const out = new Uint8Array(text.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < text.length; i++) {
    view.setUint16(i * 2, text.charCodeAt(i), littleEndian);
  }
  return out;
}

function latin1ToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      throw new DecodeError(
        `Character "${text[i]}" cannot be represented in Latin-1. Use UTF-8 instead.`,
      );
    }
    out[i] = code;
  }
  return out;
}

/** Turn what the user typed into the bytes the algorithm will process. */
export function textToBytes(text: string, encoding: InputEncoding): Uint8Array {
  switch (encoding) {
    case 'utf-8':
      return new TextEncoder().encode(text);
    case 'utf-16le':
      return utf16ToBytes(text, true);
    case 'utf-16be':
      return utf16ToBytes(text, false);
    case 'latin1':
      return latin1ToBytes(text);
    case 'hex':
      return hexToBytes(text);
    case 'base64':
      return base64ToBytes(text);
  }
}

/** Render a digest (or any byte string) for display. */
export function bytesToText(bytes: Uint8Array, encoding: OutputEncoding): string {
  switch (encoding) {
    case 'hex':
      return bytesToHex(bytes, false);
    case 'hex-upper':
      return bytesToHex(bytes, true);
    case 'base64':
      return bytesToBase64(bytes);
  }
}
