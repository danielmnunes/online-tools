// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Set SITE_URL in CI / .env once the real domain is known. It only affects
// absolute URLs: sitemap.xml, canonical links and Open Graph tags.
//
// `||` rather than `??` on purpose: an unset GitHub Actions variable arrives
// as an empty string, not as undefined, and an empty string is not a URL.
const site = process.env.SITE_URL?.trim() || 'https://online-tools.example.com';

export default defineConfig({
  site,
  // `static` is the default, stated here because it is a load-bearing choice:
  // every tool page is a real HTML file, which is what makes this deployable
  // as plain assets on Cloudflare and what makes it indexable.
  output: 'static',
  trailingSlash: 'always',
  integrations: [svelte(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    // One directory per tool -> /md5/index.html -> clean URL /md5/
    format: 'directory',
  },
});
