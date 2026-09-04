/**
 * Metadata for the byte-to-text codecs.
 *
 * Like hashes.ts and xofs.ts, this table is read at build time by the
 * registry and at run time by the widget, and imports no implementation:
 * what it declares is the *shape of the control panel*. Each entry lists the
 * options its codec accepts and which direction each applies to, so
 * Codec.svelte renders exactly the controls a given codec and direction
 * have -- there is no `if (codec === 'base32')` anywhere in the component.
 *
 * Two codecs appear here even though they are not radix conversions: HTML
 * entities and percent-encoding are the same operation as Base64 to the
 * person using them -- text goes in, different text comes out -- and the
 * widget does not care that the alphabet is `&#38;` instead of `A-Z`.
 */

export type CodecId = 'base16' | 'base32' | 'base58' | 'base64' | 'html' | 'url';

/** A direction a codec can run in. Every codec has a page for each. */
export type CodecDirection = 'encode' | 'decode';

export interface CodecOption {
  readonly value: string;
  readonly label: string;
}

export interface CodecControl {
  /** Key in the options record the widget builds. */
  readonly id: string;
  readonly label: string;
  readonly options: ReadonlyArray<CodecOption>;
  readonly default: string;
  /**
   * Which page shows the control. Padding, for instance, is a choice about
   * what to *emit*, so the decode page has no use for it: decoding strips
   * and restores padding as needed either way.
   */
  readonly appliesTo: CodecDirection | 'both';
  readonly hint?: string;
}

export interface CodecPage {
  /** Name in the nav, cards and related links. */
  readonly name: string;
  /** Page <title> and <h1>. */
  readonly title: string;
  readonly keywords: ReadonlyArray<string>;
}

export interface CodecMeta {
  readonly id: CodecId;
  /** Display name, spelled the way the specification spells it. */
  readonly label: string;
  readonly encode: CodecPage;
  readonly decode: CodecPage;
  /**
   * Whether the codec gets file pages.
   *
   * False for three different reasons, and the reasons matter:
   * - base58 is quadratic in the length of its input, so a multi-megabyte
   *   file would hang the tab rather than take a while (see codec.ts);
   * - HTML entities and percent-encoding are text transformations people
   *   apply to strings, not to files, and a "decode this .html file" page
   *   has no job the text page does not already do.
   */
  readonly file: boolean;
  readonly controls: ReadonlyArray<CodecControl>;
  /** Home-page blurb and the one-line summary under the widget's heading. */
  readonly blurb: string;
}

/** Line-wrapping control, shared by the three radix codecs. */
const WRAP: CodecControl = {
  id: 'wrap',
  label: 'Line breaks',
  options: [
    { value: 'off', label: 'None' },
    { value: '64', label: 'Every 64 characters' },
    { value: '76', label: 'Every 76 characters' },
  ],
  default: 'off',
  appliesTo: 'encode',
  hint: 'Encoded output is often wrapped for email and for PEM-style blocks. Decoding ignores it.',
};

export const CODECS: Readonly<Record<CodecId, CodecMeta>> = {
  base16: {
    id: 'base16',
    label: 'Base16',
    encode: {
      name: 'Hex encode',
      title: 'Hex (Base16) Encoder',
      keywords: ['text to hex', 'string to hex', 'bytes to hex'],
    },
    decode: {
      name: 'Hex decode',
      title: 'Hex (Base16) Decoder',
      keywords: ['hex to text', 'hex to string', 'hex to bytes'],
    },
    file: true,
    blurb: 'Two characters per byte. The one encoding whose output you can read.',
    controls: [
      {
        id: 'case',
        label: 'Case',
        options: [
          { value: 'lower', label: 'Lowercase' },
          { value: 'upper', label: 'Uppercase' },
        ],
        default: 'lower',
        appliesTo: 'both',
        hint: 'Decoding accepts either case whatever is set here.',
      },
      WRAP,
    ],
  },

  base32: {
    id: 'base32',
    label: 'Base32',
    encode: {
      name: 'Base32 encode',
      title: 'Base32 Encoder',
      keywords: ['text to base32', 'bytes to base32', 'rfc 4648'],
    },
    decode: {
      name: 'Base32 decode',
      title: 'Base32 Decoder',
      keywords: ['base32 to text', 'base32 to bytes', 'rfc 4648'],
    },
    file: true,
    blurb: 'Five bytes to eight characters: case-insensitive, and safe in a hostname.',
    controls: [
      {
        id: 'alphabet',
        label: 'Alphabet',
        options: [
          { value: 'rfc4648', label: 'RFC 4648 (A–Z, 2–7)' },
          { value: 'hex', label: 'Extended hex (0–9, A–V)' },
          { value: 'crockford', label: 'Crockford' },
        ],
        default: 'rfc4648',
        appliesTo: 'both',
        hint:
          'The extended-hex alphabet sorts the same way the bytes did, which is why it is the one ' +
          'used where encoded values have to stay in order. Crockford drops I, L, O and U to ' +
          'avoid misreadings, and reads 0 as O and 1 as I or L when decoding.',
      },
      {
        id: 'padding',
        label: 'Padding',
        options: [
          { value: 'on', label: 'Pad to a full group' },
          { value: 'off', label: 'No padding' },
        ],
        default: 'on',
        appliesTo: 'encode',
        hint: 'Crockford has no padding of its own.',
      },
      WRAP,
    ],
  },

  base58: {
    id: 'base58',
    label: 'Base58',
    encode: {
      name: 'Base58 encode',
      title: 'Base58 Encoder',
      keywords: ['text to base58', 'bytes to base58', 'bitcoin'],
    },
    decode: {
      name: 'Base58 decode',
      title: 'Base58 Decoder',
      keywords: ['base58 to text', 'base58 to bytes', 'bitcoin'],
    },
    // Deliberately no file pages: see the note on `file` above, and the
    // quadratic-cost guard in codec.ts.
    file: false,
    blurb: 'Base64 without the characters a human confuses: no 0, O, I or l.',
    controls: [
      {
        id: 'variant',
        label: 'Variant',
        options: [
          { value: 'bitcoin', label: 'Bitcoin' },
          { value: 'check', label: 'Base58Check (adds a checksum)' },
          { value: 'flickr', label: 'Flickr (lowercase first)' },
          { value: 'xmr', label: 'Monero (8-byte blocks)' },
          { value: 'xrp', label: 'Ripple / XRP' },
        ],
        default: 'bitcoin',
        appliesTo: 'both',
        hint:
          'The alphabets differ only in their order, so the same bytes encode differently under ' +
          'each. Base58Check appends four bytes of double SHA-256, which is what makes a Bitcoin ' +
          'address reject a typo. Monero splits its input into 8-byte blocks, which is the only ' +
          'variant here that is not quadratic in the length of the input.',
      },
    ],
  },

  base64: {
    id: 'base64',
    label: 'Base64',
    encode: {
      name: 'Base64 encode',
      title: 'Base64 Encoder',
      keywords: ['text to base64', 'string to base64', 'bytes to base64', 'rfc 4648'],
    },
    decode: {
      name: 'Base64 decode',
      title: 'Base64 Decoder',
      keywords: ['base64 to text', 'base64 to string', 'base64 to bytes', 'rfc 4648'],
    },
    file: true,
    blurb: 'Three bytes to four characters. The default answer for bytes inside text.',
    controls: [
      {
        id: 'alphabet',
        label: 'Alphabet',
        options: [
          { value: 'standard', label: 'Standard (+/)' },
          { value: 'url', label: 'URL-safe (-_)' },
        ],
        default: 'standard',
        appliesTo: 'both',
        hint:
          'The URL-safe alphabet swaps + and / for - and _, so the result survives a query ' +
          'string and a filename. Decoding accepts either.',
      },
      {
        id: 'padding',
        label: 'Padding',
        options: [
          { value: 'on', label: 'Pad with =' },
          { value: 'off', label: 'No padding' },
        ],
        default: 'on',
        appliesTo: 'encode',
        hint: 'JWTs and many URL-safe uses drop it, because = has to be escaped in a query string.',
      },
      WRAP,
    ],
  },

  html: {
    id: 'html',
    label: 'HTML entities',
    encode: {
      name: 'HTML entities encode',
      title: 'HTML Entities Encoder',
      keywords: ['escape html', 'html escape', 'html special characters'],
    },
    decode: {
      name: 'HTML entities decode',
      title: 'HTML Entities Decoder',
      keywords: ['unescape html', 'html unescape', 'decode entities'],
    },
    file: false,
    blurb: 'Escape text so a browser shows it instead of parsing it.',
    controls: [
      {
        id: 'form',
        label: 'Entity form',
        options: [
          { value: 'named', label: 'Named (&amp;)' },
          { value: 'decimal', label: 'Decimal (&#38;)' },
          { value: 'hex', label: 'Hexadecimal (&#x26;)' },
        ],
        default: 'named',
        appliesTo: 'encode',
        hint: 'Named entities are readable; numeric ones need no table to decode.',
      },
      {
        id: 'scope',
        label: 'Escape',
        options: [
          { value: 'five', label: '& < > " \'' },
          { value: 'three', label: '& < > only' },
          { value: 'non-ascii', label: '& < > " \' and everything above ASCII' },
        ],
        default: 'five',
        appliesTo: 'encode',
        hint:
          'Quotes only have to be escaped inside an attribute value, but escaping them always is ' +
          'harmless. Escaping non-ASCII makes the result safe to paste into a page served in ' +
          'another charset.',
      },
    ],
  },

  url: {
    id: 'url',
    label: 'URL encoding',
    encode: {
      name: 'URL encode',
      title: 'URL Encoder',
      keywords: ['percent encode', 'url escape', 'encodeuri', 'encodeuricomponent'],
    },
    decode: {
      name: 'URL decode',
      title: 'URL Decoder',
      keywords: ['percent decode', 'url unescape', 'decodeuri', 'decodeuricomponent'],
    },
    file: false,
    blurb: 'Percent-encoding: the bytes that are not allowed where you are putting them.',
    controls: [
      {
        id: 'mode',
        label: 'Mode',
        options: [
          { value: 'component', label: 'Component (encodeURIComponent)' },
          { value: 'uri', label: 'Whole URL (encodeURI)' },
          { value: 'form', label: 'Form (application/x-www-form-urlencoded)' },
          { value: 'strict', label: 'Strict (RFC 3986 unreserved only)' },
        ],
        default: 'component',
        appliesTo: 'both',
        hint:
          'A component escapes the characters that separate parts of a URL, so the result is safe ' +
          'in a query value. Whole-URL leaves the separators alone and only escapes what cannot ' +
          'appear in a URL at all. Form encoding turns a space into +, which the other three do ' +
          'not -- and which is why decoding has to know the mode.',
      },
    ],
  },
};

export const CODEC_IDS = Object.keys(CODECS) as CodecId[];

export function isCodecId(value: string): value is CodecId {
  return Object.hasOwn(CODECS, value);
}

/** Slug of the text page for a codec and direction. */
export function codecSlug(id: CodecId, direction: CodecDirection): string {
  return `${id}/${direction}`;
}

/** Slug of the file page for a codec and direction. */
export function codecFileSlug(id: CodecId, direction: CodecDirection): string {
  return `${id}/file/${direction}`;
}
