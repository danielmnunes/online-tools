import type { HashId } from '~/lib/algo/hashes';
import type { KdfId } from '~/lib/algo/kdfs';
import type { XofId } from '~/lib/algo/xofs';

export type ToolCategory =
  | 'hash'
  | 'xof'
  | 'kdf'
  | 'crypto'
  | 'compression'
  | 'encoding'
  | 'format'
  | 'convert'
  | 'generator'
  | 'other';

export interface CategoryMeta {
  readonly id: ToolCategory;
  readonly label: string;
  readonly blurb: string;
}

export const CATEGORIES: ReadonlyArray<CategoryMeta> = [
  { id: 'hash', label: 'Hash', blurb: 'Checksums, message digests and keyed hashes.' },
  {
    id: 'xof',
    label: 'XOF & MAC',
    blurb: 'Extendable-output functions and keyed authentication from SP 800-185.',
  },
  {
    id: 'kdf',
    label: 'Key derivation',
    blurb: 'Password hashing and key derivation: PBKDF2, scrypt, bcrypt, Argon2.',
  },
  { id: 'encoding', label: 'Encoding', blurb: 'Base64, hex, URL and HTML encoding.' },
  { id: 'crypto', label: 'Cryptography', blurb: 'Symmetric ciphers, signatures and key pairs.' },
  { id: 'compression', label: 'Compression', blurb: 'Compress, decompress and inspect archives.' },
  { id: 'format', label: 'Format', blurb: 'Validate, format and compare JSON and XML.' },
  { id: 'convert', label: 'Convert', blurb: 'Change case, parse URLs, convert timestamps.' },
  { id: 'generator', label: 'Generator', blurb: 'UUIDs, passwords and QR codes.' },
  { id: 'other', label: 'Other', blurb: 'Everything else.' },
];

export const CATEGORY_BY_ID: Readonly<Record<ToolCategory, CategoryMeta>> =
  Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<ToolCategory, CategoryMeta>;

interface ToolBase {
  /**
   * URL path without surrounding slashes: 'md5' -> /md5/,
   * 'base64/encode' -> /base64/encode/. Must match the MDX filename in
   * src/content/tools/, which is enforced at build time.
   */
  readonly slug: string;
  /** Short name, used in nav and cards. */
  readonly name: string;
  /** Page <title> and <h1>. */
  readonly title: string;
  readonly category: ToolCategory;
  /** Feeds the search index and the meta keywords. */
  readonly keywords: ReadonlyArray<string>;
  /** Slugs shown under "Related tools". */
  readonly related?: ReadonlyArray<string>;
}

/**
 * A tool is a widget plus its configuration. Adding a tool means adding an
 * entry here, not writing a page: the dynamic route generates the HTML, the
 * nav, the sitemap entry and the search record from this union.
 *
 * Each new widget adds an arm. Keeping it a discriminated union means a
 * config that does not match its widget is a type error, not a runtime blank
 * page.
 */
export type Tool = ToolBase &
  (
    | { readonly widget: 'text-hash'; readonly config: { readonly algorithm: HashId } }
    | { readonly widget: 'file-hash'; readonly config: { readonly algorithm: HashId } }
    | { readonly widget: 'text-xof'; readonly config: { readonly algorithm: XofId } }
    | { readonly widget: 'file-xof'; readonly config: { readonly algorithm: XofId } }
    /** The standalone HMAC calculator, which picks its own hash at runtime. */
    | { readonly widget: 'hmac'; readonly config: Record<string, never> }
    | {
        readonly widget: 'kdf';
        readonly config: {
          readonly algorithm: KdfId;
          /**
           * Derive shows the result; verify checks a password against one that
           * was stored earlier. Same inputs, opposite direction.
           */
          readonly mode: 'derive' | 'verify';
        };
      }
  );

export type WidgetKind = Tool['widget'];
