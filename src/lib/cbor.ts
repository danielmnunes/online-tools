/**
 * CBOR: RFC 8949, the Concise Binary Object Representation.
 *
 * Encoding and decoding are cbor2's, which is what it is for. What this module
 * adds is the presentation: RFC 8949 §8 diagnostic notation as the primary
 * view of a decoded item, an annotated byte-by-byte reading of it, and a JSON
 * rendering for pasting elsewhere. The three say different things -- the
 * diagnostic is what the bytes *mean*, the annotation is how they are laid
 * out, and the JSON is what most code wants -- and showing all three is what
 * makes a dump of bytes legible.
 *
 * Encoding takes JSON, which is deliberately the smaller promise: JSON cannot
 * express a byte string, a big integer or a tag, so this direction handles
 * objects, arrays, numbers, strings, booleans and null and nothing else.
 */
import { decode, encode } from 'cbor2';
import { comment } from 'cbor2/comment';
import { diagnose } from 'cbor2/diagnostic';
import { base64ToBytes, bytesToHex, hexToBytes, DecodeError } from './encoding';

export type CborEncoding = 'hex' | 'base64';

export interface CborView {
  readonly bytes: Uint8Array;
  /** RFC 8949 §8 diagnostic notation, pretty-printed. */
  readonly diagnostic: string;
  /** The same bytes, annotated: one line per item with its type and length. */
  readonly annotated: string;
  /** JSON, for pasting somewhere that does not speak CBOR. */
  readonly json: string;
}

export interface CborEncoded extends CborView {
  readonly hex: string;
  /** Bytes the equivalent JSON would have taken, for the size comparison. */
  readonly jsonSize: number;
}

export interface CborEncodeOptions {
  /**
   * Sort map keys so that the same data always encodes to the same bytes.
   *
   * Two encoders that agree on the data can still disagree on the bytes: JSON
   * object order is not defined to be preserved, and a signature over CBOR is
   * over bytes. This is the switch that makes such an encoding reproducible.
   */
  readonly deterministic: boolean;
}

/** Bytes to the decoded views, throwing DecodeError with a readable message. */
function view(bytes: Uint8Array): CborView {
  try {
    return {
      bytes,
      diagnostic: diagnose(bytes, { pretty: true }),
      annotated: comment(bytes),
      json: JSON.stringify(toJsonable(decode(bytes)), null, 2) ?? 'null',
    };
  } catch (error) {
    throw new DecodeError(
      `Not valid CBOR: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Turn a decoded value into something JSON can represent.
 *
 * CBOR has four things JSON does not: maps with non-string keys, integers
 * wider than 2^53, byte strings, and tags. Each gets a rendering that keeps
 * the information visible rather than dropping it: the diagnostic view above
 * is the one that shows them exactly.
 */
function toJsonable(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (value instanceof Date) return value.toISOString();
  // Registered tag decoders hand back real objects -- tag 32 becomes a URL --
  // and whatever they are, their own JSON form is the right one to use.
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, item]) => [describeKey(key), toJsonable(item)]),
    );
  }
  if (Array.isArray(value)) return value.map(toJsonable);
  if (value !== null && typeof value === 'object') {
    // A tag: the number and what it wraps.
    const tagged = value as { tag?: unknown; contents?: unknown };
    if (typeof tagged.tag === 'number' || typeof tagged.tag === 'bigint') {
      return { tag: tagged.tag.toString(), value: toJsonable(tagged.contents) };
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJsonable(item)]),
    );
  }
  return value;
}

/** A map key that is not a string is written the way diagnostic notation writes it. */
function describeKey(key: unknown): string {
  if (typeof key === 'string') return key;
  if (typeof key === 'bigint') return key.toString();
  if (key instanceof Uint8Array) return `h'${bytesToHex(key)}'`;
  return String(key);
}

/** The bytes of a hex or Base64 string, whichever the user pasted. */
function bytesFrom(text: string, encoding: CborEncoding): Uint8Array {
  const cleaned = text.replace(/\s/g, '');
  if (cleaned === '') throw new DecodeError('Paste some CBOR to decode: hex or Base64.');
  return encoding === 'hex' ? hexToBytes(cleaned) : base64ToBytes(cleaned);
}

/** Decode CBOR, given hex or Base64. */
export function decodeCbor(text: string, encoding: CborEncoding = 'hex'): CborView {
  return view(bytesFrom(text, encoding));
}

/** Encode JSON as CBOR. */
export function encodeCbor(
  source: string,
  { deterministic = false }: CborEncodeOptions = { deterministic: false },
): CborEncoded {
  if (source.trim() === '') throw new DecodeError('Paste some JSON to encode.');

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new DecodeError(
      `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = encode(value, deterministic ? { cde: true } : {});
  } catch (error) {
    throw new DecodeError(
      `Could not encode that as CBOR: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    ...view(bytes),
    hex: bytesToHex(bytes),
    jsonSize: new TextEncoder().encode(JSON.stringify(value)).length,
  };
}
