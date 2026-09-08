/**
 * Metadata for the generator tools.
 *
 * Same contract as formats.ts: this table is read at build time by the
 * registry and at run time by the widget, and imports no implementation.
 * GeneratorTool.svelte branches on `kind`, not on the id, so the six UUID
 * pages share one arm and the two QR pages do not pull each other's code.
 *
 * Nine pages: UUID v1/v3/v4/v5/v6/v7, a password generator, a QR encoder
 * and a QR scanner. That is the catalogue in PRD §8. v2 (DCE security) is
 * omitted because it needs a POSIX UID the browser does not have.
 */

export type GeneratorId =
  | 'uuid-v1'
  | 'uuid-v3'
  | 'uuid-v4'
  | 'uuid-v5'
  | 'uuid-v6'
  | 'uuid-v7'
  | 'password'
  | 'qr'
  | 'qr-scan';

export type GeneratorKind = 'uuid' | 'password' | 'qr-encode' | 'qr-scan';

export type UuidVersion = 1 | 3 | 4 | 5 | 6 | 7;

/**
 * Extra module the page loads, if any.
 *
 * Encoding a QR code is a few kilobytes of JavaScript (uqr). Decoding one
 * pulls in a 1.1 MB WASM reader, so it is a separate chunk: `/uuid/v4/`
 * must not download ZXing.
 */
export type GeneratorChunk = 'qr-encode' | 'qr-scan';

export interface GeneratorMeta {
  readonly id: GeneratorId;
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly kind: GeneratorKind;
  readonly version?: UuidVersion;
  readonly chunk?: GeneratorChunk;
  readonly keywords: ReadonlyArray<string>;
  readonly related: ReadonlyArray<string>;
  readonly blurb: string;
  readonly placeholder: string;
}

export const GENERATORS: Readonly<Record<GeneratorId, GeneratorMeta>> = {
  'uuid-v1': {
    id: 'uuid-v1',
    slug: 'uuid/v1',
    name: 'UUID v1',
    title: 'UUID v1 Generator',
    kind: 'uuid',
    version: 1,
    keywords: ['uuid v1', 'guid v1', 'time based uuid', 'rfc 9562', 'gregorian uuid'],
    related: ['uuid/v6', 'uuid/v7', 'uuid/v4'],
    blurb: 'A 60-bit Gregorian timestamp, a clock sequence, and a 48-bit node. The node is a random multicast address, not a MAC.',
    placeholder: 'C232AB00-9414-11EC-B3C8-9F6BDECED846',
  },
  'uuid-v3': {
    id: 'uuid-v3',
    slug: 'uuid/v3',
    name: 'UUID v3',
    title: 'UUID v3 Generator',
    kind: 'uuid',
    version: 3,
    keywords: ['uuid v3', 'md5 uuid', 'namespace uuid', 'rfc 9562', 'name based uuid'],
    related: ['uuid/v5', 'uuid/v4', 'md5'],
    blurb: 'MD5 of a namespace UUID plus a name. The same pair always produces the same UUID. Prefer v5 unless you are matching something that already used MD5.',
    placeholder: 'www.example.com',
  },
  'uuid-v4': {
    id: 'uuid-v4',
    slug: 'uuid/v4',
    name: 'UUID v4',
    title: 'UUID v4 Generator',
    kind: 'uuid',
    version: 4,
    keywords: ['uuid v4', 'guid', 'random uuid', 'rfc 9562', 'uuid generator'],
    related: ['uuid/v7', 'uuid/v1', 'password'],
    blurb: '122 random bits from crypto.getRandomValues, with the version and variant bits filled in. Not Math.random.',
    placeholder: '919108f7-52d1-4320-9bac-f847db4148a8',
  },
  'uuid-v5': {
    id: 'uuid-v5',
    slug: 'uuid/v5',
    name: 'UUID v5',
    title: 'UUID v5 Generator',
    kind: 'uuid',
    version: 5,
    keywords: ['uuid v5', 'sha1 uuid', 'namespace uuid', 'rfc 9562', 'name based uuid'],
    related: ['uuid/v3', 'uuid/v4', 'sha1'],
    blurb: 'SHA-1 of a namespace UUID plus a name, truncated to 128 bits. Deterministic: the same pair is the same UUID, everywhere.',
    placeholder: 'www.example.com',
  },
  'uuid-v6': {
    id: 'uuid-v6',
    slug: 'uuid/v6',
    name: 'UUID v6',
    title: 'UUID v6 Generator',
    kind: 'uuid',
    version: 6,
    keywords: ['uuid v6', 'reordered uuid', 'sortable uuid', 'rfc 9562', 'time based uuid'],
    related: ['uuid/v1', 'uuid/v7', 'uuid/v4'],
    blurb: 'The same fields as v1, reordered so the timestamp is at the front and the values sort by time. New systems that want a time UUID usually want v7 instead.',
    placeholder: '1EC9414C-232A-6B00-B3C8-9F6BDECED846',
  },
  'uuid-v7': {
    id: 'uuid-v7',
    slug: 'uuid/v7',
    name: 'UUID v7',
    title: 'UUID v7 Generator',
    kind: 'uuid',
    version: 7,
    keywords: ['uuid v7', 'unix timestamp uuid', 'sortable uuid', 'rfc 9562', 'uuidv7'],
    related: ['uuid/v4', 'uuid/v6', 'uuid/v1'],
    blurb: 'Unix milliseconds in the first 48 bits, then random. Sorts by time in a database index. Successive values from this page are monotonic.',
    placeholder: '017F22E2-79B0-7CC3-98C4-DC0C0C07398F',
  },
  password: {
    id: 'password',
    slug: 'password',
    name: 'Password generator',
    title: 'Password Generator',
    kind: 'password',
    keywords: [
      'password generator',
      'random password',
      'secure password',
      'crypto.getRandomValues',
      'passphrase',
    ],
    related: ['uuid/v4', 'bcrypt', 'argon2id'],
    blurb: 'Rejection sampling over crypto.getRandomValues, never Math.random. The number under the result is the entropy of the alphabet, not a guess at how long the password will last.',
    placeholder: '',
  },
  qr: {
    id: 'qr',
    slug: 'qr',
    name: 'QR code',
    title: 'QR Code Generator',
    kind: 'qr-encode',
    chunk: 'qr-encode',
    keywords: ['qr code', 'qr generator', 'qr code generator', 'iso 18004'],
    related: ['qr/scan', 'base64/encode', 'url/encode'],
    blurb: 'A QR code from the text you type, drawn as SVG in this tab. Error correction is the ISO/IEC 18004 level, not a decoration.',
    placeholder: 'https://example.com',
  },
  'qr-scan': {
    id: 'qr-scan',
    slug: 'qr/scan',
    name: 'QR scanner',
    title: 'QR Code Scanner',
    kind: 'qr-scan',
    chunk: 'qr-scan',
    keywords: ['qr scanner', 'scan qr code', 'qr decoder', 'read qr code'],
    related: ['qr', 'hex-dump/file', 'base64/decode'],
    blurb: 'The camera and the image stay in this tab. The decoder is ZXing, running as WebAssembly served from this origin, not from a CDN.',
    placeholder: '',
  },
};

export const GENERATOR_IDS = Object.keys(GENERATORS) as GeneratorId[];

export function isGeneratorId(value: string): value is GeneratorId {
  return Object.hasOwn(GENERATORS, value);
}
