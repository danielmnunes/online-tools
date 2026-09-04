/**
 * The codecs, dispatched from the metadata table.
 *
 * Two things happen here that a thin wrapper around @scure/base would not do.
 *
 * The first is normalisation before decoding. @scure/base rejects
 * non-canonical input on purpose -- an encoding that maps one input to two
 * outputs is how signature malleability and cache-poisoning happen -- and this
 * project wants that strictness for the things it protects. But somebody
 * pasting a Base64 blob out of an email has not asked for a canonicality
 * check. So whitespace and separators are removed, `0x` prefixes and the
 * URL-safe spellings are folded, padding is restored, and *then* decoding is
 * strict. What still fails is input that is genuinely broken: a character
 * outside the alphabet, a length no encoding could have produced, or trailing
 * bits the padding says should have been zero.
 *
 * The second is streaming. Base16, Base32 and Base64 are radix conversions
 * over power-of-two radixes, so they can be produced a chunk at a time with a
 * carry of a few bytes, which is what makes a file page possible without
 * holding the file and its encoding in memory together. Base58 is not: it is
 * a bignum radix conversion, quadratic in the length of its input, and it gets
 * no file page for that reason.
 */
import {
  base16,
  base32,
  base32crockford,
  base32hex,
  base32hexnopad,
  base32nopad,
  base58,
  base58flickr,
  base58xmr,
  base58xrp,
  base64,
  base64nopad,
  base64url,
  base64urlnopad,
  createBase58check,
  hex,
  type BytesCoder,
} from '@scure/base';
import { CODECS, type CodecDirection, type CodecId } from './algo/codecs';
import { DecodeError, hexToBytes } from './encoding';

/** What the widget passes in: one value per control its codec declares. */
export type CodecOptions = Readonly<Record<string, string>>;

export function defaultOptions(codec: CodecId): Record<string, string> {
  return Object.fromEntries(CODECS[codec].controls.map((control) => [control.id, control.default]));
}

/**
 * Check the options against the table and fill in the defaults.
 *
 * A value that is not one of a control's declared options is a programming
 * error, not something the user typed, so it throws rather than being
 * reported in the widget the way a decode failure is.
 */
function resolve(codec: CodecId, direction: CodecDirection, options: CodecOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const control of CODECS[codec].controls) {
    if (control.appliesTo !== 'both' && control.appliesTo !== direction) continue;
    const value = options[control.id] ?? control.default;
    if (!control.options.some((option) => option.value === value)) {
      throw new Error(
        `${CODECS[codec].label}: "${value}" is not an accepted value for ${control.id}.`,
      );
    }
    out[control.id] = value;
  }
  return out;
}

/** Turn whatever the strict decoder threw into something worth showing. */
function notValid(label: string, error: unknown): never {
  const detail = error instanceof Error ? error.message : String(error);
  throw new DecodeError(`Not valid ${label}: ${detail}`);
}

/**
 * Wrap an encoded string onto lines of at most `width` characters.
 *
 * Only ever applied on the way out. Decoding strips every character that is
 * not in the alphabet, newlines included, so a wrapped input needs no option.
 */
function wrapLines(text: string, width: number): string {
  if (width <= 0 || text.length <= width) return text;
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines.join('\n');
}

function wrapWidth(value: string | undefined): number {
  if (value === undefined || value === 'off') return 0;
  const width = Number.parseInt(value, 10);
  return Number.isFinite(width) ? width : 0;
}

// ---------------------------------------------------------------------------
// Base16
// ---------------------------------------------------------------------------

/**
 * `hex` emits lowercase and decodes either case; `base16` is RFC 4648's
 * uppercase-only spelling. Decoding always goes through `hex`, because asking
 * somebody to set a switch before their paste is accepted is not a feature.
 */
function base16Coder(letterCase: string): BytesCoder {
  return letterCase === 'upper' ? base16 : hex;
}

function encodeBase16(bytes: Uint8Array, options: Record<string, string>): string {
  return wrapLines(base16Coder(options['case']).encode(bytes), wrapWidth(options['wrap']));
}

function decodeBase16(text: string, label: string): Uint8Array {
  try {
    return hexToBytes(text);
  } catch (error) {
    if (error instanceof DecodeError) throw error;
    return notValid(label, error);
  }
}

// ---------------------------------------------------------------------------
// Base32
// ---------------------------------------------------------------------------

interface CoderPair {
  /** Full groups: never emits padding. */
  readonly plain: BytesCoder;
  /** The final partial group: emits padding when the variant has any. */
  readonly padded: BytesCoder;
}

const BASE32_CODERS: Readonly<Record<string, CoderPair>> = {
  rfc4648: { plain: base32nopad, padded: base32 },
  hex: { plain: base32hexnopad, padded: base32hex },
  // Crockford has no padding character, and its decoder rejects one.
  crockford: { plain: base32crockford, padded: base32crockford },
};

function encodeBase32(bytes: Uint8Array, options: Record<string, string>): string {
  const pair = BASE32_CODERS[options['alphabet'] ?? 'rfc4648']!;
  const coder = options['padding'] === 'off' ? pair.plain : pair.padded;
  return wrapLines(coder.encode(bytes), wrapWidth(options['wrap']));
}

function decodeBase32(text: string, options: Record<string, string>, label: string): Uint8Array {
  const alphabet = options['alphabet'] ?? 'rfc4648';
  const pair = BASE32_CODERS[alphabet]!;
  const cleaned = text.replace(/[\s=]/g, '');
  if (cleaned === '') return new Uint8Array(0);

  // Crockford's decoder normalises O to 0 and I and L to 1 itself, and is
  // case-insensitive; the RFC 4648 alphabets are uppercase-only and strict.
  const canonical = alphabet === 'crockford' ? cleaned : cleaned.toUpperCase();

  if (alphabet === 'crockford') {
    try {
      return pair.plain.decode(canonical);
    } catch (error) {
      return notValid(label, error);
    }
  }

  // Eight characters carry five bytes, so any other length is padding. A
  // remainder of 1, 3 or 6 cannot be produced by any input, and saying so is
  // more useful than the generic failure the decoder would report.
  const remainder = canonical.length % 8;
  if (remainder === 1 || remainder === 3 || remainder === 6) {
    throw new DecodeError(
      `Not valid ${label}: ${canonical.length} characters is not a length Base32 can produce. ` +
        `Characters come in groups of eight; check for a missing or extra character.`,
    );
  }
  const padded = canonical + '='.repeat(remainder === 0 ? 0 : 8 - remainder);
  try {
    return pair.padded.decode(padded);
  } catch (error) {
    return notValid(label, error);
  }
}

// ---------------------------------------------------------------------------
// Base58
// ---------------------------------------------------------------------------

const BASE58_CODERS: Readonly<Record<string, BytesCoder>> = {
  bitcoin: base58,
  flickr: base58flickr,
  xmr: base58xmr,
  xrp: base58xrp,
};

/**
 * Where the quadratic variants stop being instant.
 *
 * Base58 is a bignum radix conversion, so the work grows with the square of
 * the length of the input: not slow, but not something to run on a file.
 * @scure/base refuses inputs past this itself, with a message that says the
 * limit but not the reason; checking here means the message can explain why
 * there is a limit at all, and can exempt Monero, which is linear.
 */
const BASE58_MAX_BYTES = 2048;
const BASE58_MAX_CHARS = 4096;

const QUADRATIC_NOTE =
  'Base58 is a radix conversion, so the work grows with the square of the length of the input. ' +
  `This input is past the ${BASE58_MAX_BYTES} bytes that keep it instant; the Monero variant ` +
  'encodes in 8-byte blocks and has no such limit.';

/**
 * Base58Check needs SHA-256, and it is the only thing on any of these pages
 * that does. Importing it here rather than at the top keeps the hash out of
 * the chunk for every other codec.
 */
async function base58Check(): Promise<BytesCoder> {
  const { sha256 } = await import('@noble/hashes/sha2.js');
  return createBase58check(sha256);
}

async function encodeBase58(bytes: Uint8Array, options: Record<string, string>): Promise<string> {
  const variant = options['variant'] ?? 'bitcoin';
  if (variant !== 'xmr' && bytes.length > BASE58_MAX_BYTES) throw new DecodeError(QUADRATIC_NOTE);

  if (variant === 'check') return (await base58Check()).encode(bytes);
  return BASE58_CODERS[variant]!.encode(bytes);
}

async function decodeBase58(
  text: string,
  options: Record<string, string>,
  label: string,
): Promise<Uint8Array> {
  const variant = options['variant'] ?? 'bitcoin';
  const cleaned = text.replace(/\s/g, '');
  if (cleaned === '') return new Uint8Array(0);
  if (variant !== 'xmr' && cleaned.length > BASE58_MAX_CHARS) throw new DecodeError(QUADRATIC_NOTE);

  try {
    const coder = variant === 'check' ? await base58Check() : BASE58_CODERS[variant]!;
    return coder.decode(cleaned);
  } catch (error) {
    return notValid(label, error);
  }
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

const BASE64_CODERS: Readonly<Record<string, CoderPair>> = {
  standard: { plain: base64nopad, padded: base64 },
  url: { plain: base64urlnopad, padded: base64url },
};

function encodeBase64(bytes: Uint8Array, options: Record<string, string>): string {
  const pair = BASE64_CODERS[options['alphabet'] ?? 'standard']!;
  const coder = options['padding'] === 'off' ? pair.plain : pair.padded;
  return wrapLines(coder.encode(bytes), wrapWidth(options['wrap']));
}

function decodeBase64(text: string, label: string): Uint8Array {
  // Both alphabets are accepted whatever the switch says: they differ in two
  // characters, and a person does not know which one produced their string.
  const cleaned = text.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (cleaned === '') return new Uint8Array(0);

  const remainder = cleaned.length % 4;
  if (remainder === 1) {
    throw new DecodeError(
      `Not valid ${label}: ${cleaned.length} characters is not a length Base64 can produce. ` +
        `Characters come in groups of four; check for a missing or extra character.`,
    );
  }
  const padded = cleaned + '='.repeat(remainder === 0 ? 0 : 4 - remainder);

  try {
    return BASE64_CODERS['standard']!.padded.decode(padded);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.startsWith('Non-zero padding')) {
      return notValid(
        label,
        new Error(
          'the final character carries bits that the padding says should be zero. ' +
            'The input is truncated, corrupted, or was cut at the wrong point.',
        ),
      );
    }
    return notValid(label, error);
  }
}

// ---------------------------------------------------------------------------
// HTML entities
// ---------------------------------------------------------------------------

const HTML_NAMED: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** `&#38;` or `&#x26;`. Uppercase hex, which is what every example uses. */
function numericEntity(codePoint: number, form: string): string {
  return form === 'decimal' ? `&#${codePoint};` : `&#x${codePoint.toString(16).toUpperCase()};`;
}

function encodeHtml(text: string, options: Record<string, string>): string {
  const form = options['form'] ?? 'named';
  const scope = options['scope'] ?? 'five';
  const escapeQuotes = scope !== 'three';
  const escapeNonAscii = scope === 'non-ascii';

  let out = '';
  // Code points, not code units: an astral character is one entity, not two.
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    const isQuote = char === '"' || char === "'";
    const isEscapable = char === '&' || char === '<' || char === '>' || isQuote;

    if (isEscapable) {
      if (isQuote && !escapeQuotes) {
        out += char;
        continue;
      }
      out += form === 'named' ? HTML_NAMED[char]! : numericEntity(codePoint, form);
      continue;
    }

    // Named references exist for some non-ASCII characters (&euro;, &copy;),
    // but support for them is patchier than for the five above, and the point
    // of escaping them is usually to survive a charset the reader does not
    // have. Numeric references always work, so they are what gets written.
    if (codePoint > 0x7e && escapeNonAscii) {
      out += numericEntity(codePoint, form === 'decimal' ? 'decimal' : 'hex');
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * Bytes as the text that escaping works on.
 *
 * Escaping is a text operation, so bytes that are not UTF-8 cannot be escaped:
 * they have to be carried as Base64 or hex first. Saying that is better than
 * letting the decoder throw about encodings.
 */
function escapableText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new DecodeError(
      'Those bytes are not valid UTF-8, so there is no text here to escape. ' +
        'Encode them as Base64 or Hex first.',
    );
  }
}

/**
 * Decode character references using the browser's own table.
 *
 * The alternative is a 2 231-entry transcription of the HTML5 named character
 * references, which would be a second, worse copy of a table the runtime
 * already has -- and the one that will actually be applied to the result.
 *
 * The literal `<` is escaped before parsing, which is what makes this safe:
 * with no `<` in the input the parser cannot create an element, so it can only
 * ever produce text. Nothing can be fetched, no script can run, and the node
 * is never inserted into the page. A `<` that arrived as `&lt;` is untouched
 * by that substitution and still decodes to the character the user wanted.
 */
function decodeHtml(text: string, label: string): string {
  if (typeof document === 'undefined') {
    throw new DecodeError(`Decoding ${label} needs a browser DOM; there is none here.`);
  }
  const holder = document.createElement('div');
  holder.innerHTML = text.replace(/</g, '&lt;');
  return holder.textContent ?? '';
}

// ---------------------------------------------------------------------------
// Percent-encoding
// ---------------------------------------------------------------------------

/**
 * The characters each mode leaves alone.
 *
 * Written out rather than delegated to encodeURIComponent, for two reasons:
 * that function throws on a lone surrogate, and this widget encodes bytes that
 * came out of a hex or Base64 box, which a string-based function never sees.
 */
const URL_PASS: Readonly<Record<string, RegExp>> = {
  // What encodeURIComponent leaves: RFC 3986 unreserved plus the sub-delims
  // that only matter as separators once you are inside a component.
  component: /[A-Za-z0-9\-._~!*'()]/,
  // What encodeURI leaves: the same, plus the reserved characters whose whole
  // job is to separate the parts of a URL.
  uri: /[A-Za-z0-9\-._~!*'()#$&+,/:;=?@]/,
  // The WHATWG urlencoded serializer. Space becomes +, which is why decoding
  // has to be told the mode: + is only a space in this one.
  form: /[A-Za-z0-9*\-._]/,
  // RFC 3986 unreserved and nothing else.
  strict: /[A-Za-z0-9\-._~]/,
};

function percentEncode(bytes: Uint8Array, mode: string): string {
  const pass = URL_PASS[mode] ?? URL_PASS['component']!;
  const digits = '0123456789ABCDEF';
  let out = '';
  for (const byte of bytes) {
    if (byte < 0x80) {
      const char = String.fromCharCode(byte);
      if (pass.test(char)) {
        out += char;
        continue;
      }
      if (byte === 0x20 && mode === 'form') {
        out += '+';
        continue;
      }
    }
    out += '%' + digits[byte >> 4]! + digits[byte & 0x0f]!;
  }
  return out;
}

function percentDecode(text: string, mode: string, label: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();
  let plain = '';

  const flush = () => {
    if (plain === '') return;
    chunks.push(encoder.encode(plain));
    plain = '';
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char === '%') {
      const digits = text.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(digits)) {
        throw new DecodeError(
          `Not valid ${label}: "%${digits}" at position ${i + 1} is not two hexadecimal digits. ` +
            `A percent sign that is meant literally has to be written as %25.`,
        );
      }
      flush();
      chunks.push(new Uint8Array([Number.parseInt(digits, 16)]));
      i += 3;
      continue;
    }
    if (char === '+' && mode === 'form') {
      flush();
      chunks.push(new Uint8Array([0x20]));
      i += 1;
      continue;
    }
    plain += char;
    i += 1;
  }
  flush();

  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Bytes to text. Async only because Base58Check loads SHA-256 on demand. */
export async function encodeBytes(
  codec: CodecId,
  bytes: Uint8Array,
  options: CodecOptions = {},
): Promise<string> {
  const resolved = resolve(codec, 'encode', options);
  switch (codec) {
    case 'base16':
      return encodeBase16(bytes, resolved);
    case 'base32':
      return encodeBase32(bytes, resolved);
    case 'base64':
      return encodeBase64(bytes, resolved);
    case 'base58':
      return encodeBase58(bytes, resolved);
    case 'html':
      return encodeHtml(escapableText(bytes), resolved);
    case 'url':
      return percentEncode(bytes, resolved['mode'] ?? 'component');
  }
}

/** Text to bytes. Throws DecodeError with something worth reading. */
export async function decodeText(
  codec: CodecId,
  text: string,
  options: CodecOptions = {},
): Promise<Uint8Array> {
  const resolved = resolve(codec, 'decode', options);
  const label = CODECS[codec].label;
  switch (codec) {
    case 'base16':
      return decodeBase16(text, label);
    case 'base32':
      return decodeBase32(text, resolved, label);
    case 'base64':
      return decodeBase64(text, label);
    case 'base58':
      return decodeBase58(text, resolved, label);
    case 'html': {
      const decoded = decodeHtml(text, label);
      return new TextEncoder().encode(decoded);
    }
    case 'url':
      return percentDecode(text, resolved['mode'] ?? 'component', label);
  }
}

export interface StreamingEncoder {
  update(chunk: Uint8Array): void;
  finish(): string;
}

/**
 * Bytes per group, and the coders to use with and without a partial group.
 *
 * Only the three power-of-two radixes are here: Base16 takes one byte at a
 * time, Base32 five, Base64 three, and in each case a group maps to a whole
 * number of characters, so a chunk boundary can fall anywhere as long as the
 * leftover bytes are carried.
 */
function streamCoder(codec: CodecId, options: Record<string, string>): {
  group: number;
  plain: BytesCoder;
  padded: BytesCoder;
} {
  switch (codec) {
    case 'base16': {
      const coder = base16Coder(options['case'] ?? 'lower');
      return { group: 1, plain: coder, padded: coder };
    }
    case 'base32': {
      const pair = BASE32_CODERS[options['alphabet'] ?? 'rfc4648']!;
      return { group: 5, ...pair };
    }
    case 'base64': {
      const pair = BASE64_CODERS[options['alphabet'] ?? 'standard']!;
      return { group: 3, ...pair };
    }
    default:
      throw new Error(
        `${CODECS[codec].label} cannot be produced a chunk at a time, so it has no file page.`,
      );
  }
}

/**
 * Encode a stream of chunks without ever holding the whole input.
 *
 * Padding is what forces the two-coder arrangement: only the final group is
 * padded, so every complete group is encoded with the unpadded variant and the
 * carry, if there is one, with the padded one.
 */
export function createStreamingEncoder(codec: CodecId, options: CodecOptions = {}): StreamingEncoder {
  const resolved = resolve(codec, 'encode', options);
  const { group, plain, padded } = streamCoder(codec, resolved);
  // The carry is the only group that can be partial, so it is the only one
  // that ever carries padding -- and only if padding was asked for.
  const tail = resolved['padding'] === 'off' ? plain : padded;
  const width = wrapWidth(resolved['wrap']);
  const parts: string[] = [];
  let carry: Uint8Array = new Uint8Array(0);

  return {
    update(chunk: Uint8Array): void {
      if (carry.length > 0) {
        const need = group - carry.length;
        if (chunk.length >= need) {
          const combined = new Uint8Array(group);
          combined.set(carry, 0);
          combined.set(chunk.subarray(0, need), carry.length);
          parts.push(plain.encode(combined));
          chunk = chunk.subarray(need);
          carry = new Uint8Array(0);
        } else {
          const combined = new Uint8Array(carry.length + chunk.length);
          combined.set(carry, 0);
          combined.set(chunk, carry.length);
          carry = combined;
          return;
        }
      }

      const usable = Math.floor(chunk.length / group) * group;
      if (usable > 0) parts.push(plain.encode(chunk.subarray(0, usable)));
      // Copied rather than subarrayed: a view would keep the whole chunk's
      // buffer alive until the next update.
      carry = chunk.slice(usable);
    },

    finish(): string {
      if (carry.length > 0) parts.push(tail.encode(carry));
      carry = new Uint8Array(0);
      return wrapLines(parts.join(''), width);
    },
  };
}
