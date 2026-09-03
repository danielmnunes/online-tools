/**
 * The tool catalogue. This is the single source of truth for routing,
 * navigation, the sitemap, breadcrumbs, related links and search.
 *
 * Hash and XOF tools are generated from their algorithm tables rather than
 * listed by hand: each algorithm yields the same shape of entry, and
 * hand-writing sixty near-identical ones would guarantee they drift. The
 * key-derivation pages are written out, because they do not have that
 * regularity -- only some have a verify page, and three Argon2 variants share
 * one.
 */
import { HASHES, HASH_IDS, familySiblings, type HashId } from '~/lib/algo/hashes';
import { KDFS, type KdfId } from '~/lib/algo/kdfs';
import {
  XOFS,
  XOF_FILE_IDS,
  XOF_IDS,
  familySiblings as xofSiblings,
  type XofId,
} from '~/lib/algo/xofs';
import { CATEGORIES, type CategoryMeta, type Tool, type ToolCategory } from './types';

/** Path of the file-checksum variant of an algorithm. */
export function fileSlug(id: HashId): string {
  return `${id}/file`;
}

function hashTools(): Tool[] {
  return HASH_IDS.flatMap((id): Tool[] => {
    const meta = HASHES[id];
    const siblings = familySiblings(id)
      .slice(0, 3)
      .map((sibling) => sibling.id);
    const lower = meta.label.toLowerCase();

    return [
      {
        slug: id,
        name: meta.label,
        title: `${meta.label} Hash Generator`,
        category: 'hash',
        widget: 'text-hash',
        config: { algorithm: id },
        keywords: [lower, id, 'hash', 'hash generator', 'online', ...meta.keywords],
        related: [fileSlug(id), ...siblings],
      },
      {
        slug: fileSlug(id),
        name: `${meta.label} (file)`,
        title: `${meta.label} File Checksum`,
        category: 'hash',
        widget: 'file-hash',
        config: { algorithm: id },
        keywords: [
          `${lower} file`,
          `${lower} checksum`,
          'checksum',
          'verify download',
          'file integrity',
          ...meta.keywords,
        ],
        related: [id, ...siblings.map(fileSlug)],
      },
    ];
  });
}

/**
 * The SP 800-185 functions, generated from their table the same way.
 *
 * The file variants are a subset rather than one per function: see
 * XOF_FILE_IDS for which, and why the others are left out.
 */
function xofTools(): Tool[] {
  const fileIds = new Set<XofId>(XOF_FILE_IDS);

  /** The other form of the same function: KMAC128 <-> KMACXOF128. */
  const counterpart = (id: XofId): XofId | undefined => {
    const meta = XOFS[id];
    if (meta.family === 'shake' || meta.family === 'cshake') return undefined;
    const other = XOF_IDS.find(
      (candidate) =>
        XOFS[candidate].family === meta.family &&
        XOFS[candidate].strength === meta.strength &&
        XOFS[candidate].squeezes !== meta.squeezes,
    );
    return other;
  };

  return XOF_IDS.flatMap((id): Tool[] => {
    const meta = XOFS[id];
    const lower = meta.label.toLowerCase();
    const siblings = xofSiblings(id)
      .slice(0, 3)
      .map((sibling) => sibling.id);
    const pair = counterpart(id);

    const text: Tool = {
      slug: id,
      name: meta.label,
      title: meta.key === 'required' ? `${meta.label} Calculator` : `${meta.label} Generator`,
      category: 'xof',
      widget: 'text-xof',
      config: { algorithm: id },
      keywords: [lower, id, 'sha-3', 'keccak', 'online', ...meta.keywords],
      related: [
        ...(fileIds.has(id) ? [`${id}/file`] : []),
        ...(pair !== undefined ? [pair] : []),
        ...siblings,
      ],
    };

    if (!fileIds.has(id)) return [text];

    return [
      text,
      {
        slug: `${id}/file`,
        name: `${meta.label} (file)`,
        title: `${meta.label} File ${meta.key === 'required' ? 'MAC' : 'Checksum'}`,
        category: 'xof',
        widget: 'file-xof',
        config: { algorithm: id },
        keywords: [`${lower} file`, `${lower} checksum`, 'file integrity', ...meta.keywords],
        related: [id, ...siblings.filter((sibling) => fileIds.has(sibling))],
      },
    ];
  });
}

/**
 * The standalone HMAC calculator.
 *
 * Every hash page already offers HMAC, but "hmac generator" is what people
 * search for when they do not yet know which hash they need, and a page that
 * starts from the key rather than from the algorithm is a different tool.
 */
function hmacTool(): Tool {
  return {
    slug: 'hmac',
    name: 'HMAC',
    title: 'HMAC Generator',
    category: 'xof',
    widget: 'hmac',
    config: {},
    keywords: [
      'hmac',
      'rfc 2104',
      'message authentication code',
      'hmac generator',
      'hmac sha256',
      'signature',
      'webhook',
    ],
    related: ['kmac128', 'sha256', 'md5', 'pbkdf2'],
  };
}

/**
 * The key-derivation pages, listed by hand.
 *
 * Unlike the hashes and the XOFs, these do not fall out of their table: only
 * some have a verify page, and Argon2's three variants share one. Generating
 * them would take more special cases than writing them down.
 */
function kdfTools(): Tool[] {
  const derive = (id: KdfId, title: string, related: string[]): Tool => ({
    slug: id,
    name: KDFS[id].label,
    title,
    category: 'kdf',
    widget: 'kdf',
    config: { algorithm: id, mode: 'derive' },
    keywords: [KDFS[id].label.toLowerCase(), id, 'key derivation', 'online', ...KDFS[id].keywords],
    related,
  });

  const verify = (slug: string, id: KdfId, name: string, title: string, related: string[]): Tool => ({
    slug,
    name,
    title,
    category: 'kdf',
    widget: 'kdf',
    config: { algorithm: id, mode: 'verify' },
    keywords: [
      `${KDFS[id].label.toLowerCase()} verify`,
      `${KDFS[id].label.toLowerCase()} checker`,
      'check password',
      'password verification',
      ...KDFS[id].keywords,
    ],
    related,
  });

  return [
    derive('pbkdf2', 'PBKDF2 Generator', ['pbkdf2/verify', 'scrypt', 'argon2id', 'hkdf']),
    verify('pbkdf2/verify', 'pbkdf2', 'PBKDF2 verify', 'PBKDF2 Hash Verifier', [
      'pbkdf2',
      'bcrypt/verify',
      'argon2/verify',
    ]),

    derive('evpkdf', 'EvpKDF Generator', ['pbkdf2', 'hkdf', 'scrypt']),
    derive('hkdf', 'HKDF Generator', ['pbkdf2', 'hmac', 'evpkdf']),

    derive('scrypt', 'scrypt Generator', ['scrypt/verify', 'argon2id', 'bcrypt', 'pbkdf2']),
    verify('scrypt/verify', 'scrypt', 'scrypt verify', 'scrypt Hash Verifier', [
      'scrypt',
      'argon2/verify',
      'bcrypt/verify',
    ]),

    derive('bcrypt', 'bcrypt Generator', ['bcrypt/verify', 'argon2id', 'scrypt', 'pbkdf2']),
    verify('bcrypt/verify', 'bcrypt', 'bcrypt verify', 'bcrypt Hash Checker', [
      'bcrypt',
      'argon2/verify',
      'scrypt/verify',
    ]),

    derive('argon2d', 'Argon2d Generator', ['argon2id', 'argon2i', 'argon2/verify']),
    derive('argon2i', 'Argon2i Generator', ['argon2id', 'argon2d', 'argon2/verify']),
    derive('argon2id', 'Argon2id Generator', [
      'argon2/verify',
      'argon2i',
      'argon2d',
      'bcrypt',
      'scrypt',
    ]),
    verify('argon2/verify', 'argon2id', 'Argon2 verify', 'Argon2 Hash Verifier', [
      'argon2id',
      'bcrypt/verify',
      'scrypt/verify',
    ]),
  ];
}

export const TOOLS: ReadonlyArray<Tool> = [
  ...hashTools(),
  ...xofTools(),
  hmacTool(),
  ...kdfTools(),
];

const BY_SLUG = new Map(TOOLS.map((tool) => [tool.slug, tool]));

export function getTool(slug: string): Tool | undefined {
  return BY_SLUG.get(slug);
}

export function toolsInCategory(category: ToolCategory): Tool[] {
  return TOOLS.filter((tool) => tool.category === category);
}

/** Categories that actually have tools, in CATEGORIES display order. */
export function populatedCategories(): CategoryMeta[] {
  const seen = new Set(TOOLS.map((tool) => tool.category));
  return CATEGORIES.filter((category) => seen.has(category.id));
}

export function relatedTools(tool: Tool): Tool[] {
  return (tool.related ?? [])
    .map((slug) => BY_SLUG.get(slug))
    .filter((other): other is Tool => other !== undefined);
}
