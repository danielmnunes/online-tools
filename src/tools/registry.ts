/**
 * The tool catalogue. This is the single source of truth for routing,
 * navigation, the sitemap, breadcrumbs, related links and search.
 *
 * Hash tools are generated from the algorithm table rather than listed by
 * hand: each algorithm yields a text tool and a file-checksum tool, and the
 * two always want the same metadata. Hand-writing forty near-identical entries
 * would guarantee they drift.
 */
import { HASHES, HASH_IDS, familySiblings, type HashId } from '~/lib/algo/hashes';
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

export const TOOLS: ReadonlyArray<Tool> = [...hashTools()];

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
