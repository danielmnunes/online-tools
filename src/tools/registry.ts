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
import {
  CODECS,
  CODEC_IDS,
  codecFileSlug,
  codecSlug,
  type CodecDirection,
  type CodecId,
} from '~/lib/algo/codecs';
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

/**
 * The encoding pages, generated from the codec table the same way the hashes
 * are generated from theirs.
 *
 * Each codec gets a page per direction, because "base64 encode" and "base64
 * decode" are two different searches and two different shapes of page. Only the
 * codecs whose table entry says so get file pages: see CodecMeta.file for the
 * three different reasons a codec might not.
 */
function codecTools(): Tool[] {
  /** Two other codecs, so a page offers a way sideways as well as a way back. */
  const sideways = (id: CodecId, direction: CodecDirection): string[] =>
    CODEC_IDS.filter((other) => other !== id)
      .slice(0, 2)
      .map((other) => codecSlug(other, direction));

  return CODEC_IDS.flatMap((id): Tool[] => {
    const meta = CODECS[id];
    const lower = meta.label.toLowerCase();

    const text = (['encode', 'decode'] as const).map((direction): Tool => {
      const page = direction === 'encode' ? meta.encode : meta.decode;
      const other = direction === 'encode' ? 'decode' : 'encode';
      return {
        slug: codecSlug(id, direction),
        name: page.name,
        title: page.title,
        category: 'encoding',
        widget: 'codec',
        config: { codec: id, direction },
        keywords: [lower, id, direction, ...page.keywords],
        related: [
          codecSlug(id, other),
          ...(meta.file ? [codecFileSlug(id, direction)] : []),
          ...sideways(id, direction),
        ],
      };
    });

    if (!meta.file) return text;

    return [
      ...text,
      ...(['encode', 'decode'] as const).map((direction): Tool => ({
        slug: codecFileSlug(id, direction),
        name: `${meta.label} file ${direction}`,
        title: `${meta.label} File ${direction === 'encode' ? 'Encoder' : 'Decoder'}`,
        category: 'encoding',
        widget: 'file-codec',
        config: { codec: id, direction },
        keywords: [`${lower} file`, `${id} file`, `file to ${lower}`, `${lower} download`],
        related: [
          codecSlug(id, direction),
          codecFileSlug(id, direction === 'encode' ? 'decode' : 'encode'),
        ],
      })),
    ];
  });
}

/**
 * The encoding tools that are not codecs, listed by hand.
 *
 * They have no regularity to generate from: a hex dump reads bytes rather than
 * converting them, CBOR is a data format with two directions on one page, and
 * the JWT and URL pages each do a job nothing else on the site does.
 */
function encodingTools(): Tool[] {
  return [
    {
      slug: 'hex-dump',
      name: 'Hex dump',
      title: 'Hex Dump',
      category: 'encoding',
      widget: 'hex-dump',
      config: { source: 'text' },
      keywords: ['hex dump', 'hexdump', 'hex viewer', 'bytes of a string', 'binary view'],
      related: ['hex-dump/file', 'base16/encode', 'base64/encode'],
    },
    {
      slug: 'hex-dump/file',
      name: 'Hex dump (file)',
      title: 'Hex Dump of a File',
      category: 'encoding',
      widget: 'hex-dump',
      config: { source: 'file' },
      keywords: ['hex dump file', 'hexdump', 'view file bytes', 'inspect binary'],
      related: ['hex-dump', 'base16/file/encode', 'sha256/file'],
    },
    {
      slug: 'cbor',
      name: 'CBOR',
      title: 'CBOR Encoder and Decoder',
      category: 'encoding',
      widget: 'cbor',
      config: {},
      keywords: ['cbor', 'rfc 8949', 'concise binary object representation', 'decode cbor'],
      related: ['base16/decode', 'jwt', 'base64/encode'],
    },
    {
      slug: 'jwt',
      name: 'JWT decoder',
      title: 'JWT Decoder',
      category: 'encoding',
      widget: 'jwt',
      config: {},
      keywords: ['jwt', 'jwt decoder', 'json web token', 'decode jwt', 'jws', 'verify jwt'],
      related: ['cbor', 'base64/decode', 'hmac'],
    },
    {
      slug: 'url-parser',
      name: 'URL parser',
      title: 'URL Parser',
      category: 'encoding',
      widget: 'url-parser',
      config: {},
      keywords: ['url parser', 'parse url', 'query string parser', 'url components'],
      related: ['url/encode', 'url/decode'],
    },
  ];
}

export const TOOLS: ReadonlyArray<Tool> = [
  ...hashTools(),
  ...xofTools(),
  hmacTool(),
  ...kdfTools(),
  ...codecTools(),
  ...encodingTools(),
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
