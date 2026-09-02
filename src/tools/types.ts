import type { HashId } from '~/lib/algo/hashes';

export type ToolCategory =
  | 'hash'
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
  );

export type WidgetKind = Tool['widget'];
