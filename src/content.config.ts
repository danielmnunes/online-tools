import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';

/**
 * Long-form content for each tool.
 *
 * Division of responsibility: the registry (src/tools/registry.ts) owns
 * identity and routing -- slug, name, widget, config. This collection owns
 * prose -- description, explanation, FAQ, references. The build fails if the
 * two disagree, which is checked in src/pages/[...slug].astro.
 */
const tools = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/tools' }),
  schema: z.object({
    /** Meta description and the card subtitle. Kept short enough to not be truncated in search results. */
    description: z.string().min(50).max(160),
    faq: z
      .array(z.object({ q: z.string(), a: z.string() }))
      .default([]),
    references: z
      .array(z.object({ label: z.string(), url: z.url() }))
      .default([]),
  }),
});

export const collections = { tools };
