/**
 * Structural guards on the catalogue.
 *
 * The build already fails when the registry and the content collection
 * disagree, and when a slug shadows a category page. What it does not check is
 * the softer stuff: that related links point somewhere, that keywords exist,
 * that a widget's config matches the algorithm table it is drawn from. Those
 * failures produce a page that renders and is quietly wrong, which is the
 * worst kind.
 */
import { describe, expect, it } from 'vitest';
import { TOOLS, getTool, populatedCategories, relatedTools, toolsInCategory } from '~/tools/registry';
import { CATEGORIES, type Tool } from '~/tools/types';
import { HASHES, isHashId } from '~/lib/algo/hashes';
import { XOFS, XOF_FILE_IDS, XOF_IDS, isXofId } from '~/lib/algo/xofs';
import { KDFS, KDF_IDS, isKdfId } from '~/lib/algo/kdfs';

describe('slugs', () => {
  it('are unique', () => {
    const slugs = TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('are URL-safe path segments', () => {
    for (const tool of TOOLS) {
      expect(tool.slug, tool.slug).toMatch(/^[a-z0-9]+(?:[-.][a-z0-9]+)*(?:\/[a-z0-9-]+)?$/);
    }
  });

  it('never collide with a category page', () => {
    const categories = new Set<string>(CATEGORIES.map((category) => category.id));
    for (const tool of TOOLS) expect(categories.has(tool.slug), tool.slug).toBe(false);
  });
});

describe('metadata', () => {
  it('gives every tool a name, a title and keywords', () => {
    for (const tool of TOOLS) {
      expect(tool.name.length, tool.slug).toBeGreaterThan(0);
      expect(tool.title.length, tool.slug).toBeGreaterThan(0);
      expect(tool.keywords.length, tool.slug).toBeGreaterThan(2);
    }
  });

  it('puts every tool in a category that exists and is listed as populated', () => {
    const ids = new Set(CATEGORIES.map((category) => category.id));
    const populated = new Set(populatedCategories().map((category) => category.id));
    for (const tool of TOOLS) {
      expect(ids.has(tool.category), tool.slug).toBe(true);
      expect(populated.has(tool.category), tool.slug).toBe(true);
    }
  });

  it('resolves every related link to a tool that exists', () => {
    for (const tool of TOOLS) {
      for (const slug of tool.related ?? []) {
        expect(getTool(slug), `${tool.slug} -> ${slug}`).toBeDefined();
      }
      expect(relatedTools(tool).length, tool.slug).toBe((tool.related ?? []).length);
    }
  });

  it('never links a tool to itself', () => {
    for (const tool of TOOLS) {
      expect(tool.related ?? [], tool.slug).not.toContain(tool.slug);
    }
  });
});

describe('widget configuration', () => {
  /** A config that names an algorithm its table does not have renders blank. */
  it('names only algorithms that exist in the matching table', () => {
    for (const tool of TOOLS) {
      switch (tool.widget) {
        case 'text-hash':
        case 'file-hash':
          expect(isHashId(tool.config.algorithm), tool.slug).toBe(true);
          break;
        case 'text-xof':
        case 'file-xof':
          expect(isXofId(tool.config.algorithm), tool.slug).toBe(true);
          break;
        case 'kdf':
          expect(isKdfId(tool.config.algorithm), tool.slug).toBe(true);
          break;
        case 'hmac':
          expect(tool.config, tool.slug).toEqual({});
      }
    }
  });

  it('only gives a file widget to a function that can be streamed', () => {
    const fileXofs = TOOLS.filter((tool): tool is Tool & { widget: 'file-xof' } =>
      tool.widget === 'file-xof',
    );
    for (const tool of fileXofs) {
      expect(XOF_FILE_IDS, tool.slug).toContain(tool.config.algorithm);
      // TupleHash and ParallelHash have no incremental form; a file page for
      // either would be a page whose button cannot work.
      expect(['tuplehash', 'parallelhash'], tool.slug).not.toContain(
        XOFS[tool.config.algorithm].family,
      );
    }
  });

  it('only gives a verify page to an algorithm whose table says it has one', () => {
    for (const tool of TOOLS) {
      if (tool.widget !== 'kdf' || tool.config.mode !== 'verify') continue;
      expect(KDFS[tool.config.algorithm].verify, tool.slug).toBe(true);
    }
  });
});

describe('coverage of the algorithm tables', () => {
  it('gives every hash a text page and a file page', () => {
    const hashSlugs = new Set(toolsInCategory('hash').map((tool) => tool.slug));
    for (const id of Object.keys(HASHES)) {
      expect(hashSlugs.has(id), id).toBe(true);
      expect(hashSlugs.has(`${id}/file`), `${id}/file`).toBe(true);
    }
  });

  it('gives every XOF a page, and a file page exactly where the table says', () => {
    const xofSlugs = new Set(toolsInCategory('xof').map((tool) => tool.slug));
    for (const id of XOF_IDS) {
      expect(xofSlugs.has(id), id).toBe(true);
      expect(xofSlugs.has(`${id}/file`), `${id}/file`).toBe(XOF_FILE_IDS.includes(id));
    }
  });

  it('gives every KDF a page', () => {
    const kdfSlugs = new Set(toolsInCategory('kdf').map((tool) => tool.slug));
    for (const id of KDF_IDS) expect(kdfSlugs.has(id), id).toBe(true);
  });

  it('has the catalogue size phase 2 set out to deliver', () => {
    expect(toolsInCategory('hash')).toHaveLength(42);
    expect(toolsInCategory('xof')).toHaveLength(23);
    expect(toolsInCategory('kdf')).toHaveLength(12);
    expect(TOOLS).toHaveLength(77);
  });
});
