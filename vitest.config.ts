import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // Vitest bundles Vite 7 while the project builds with the Rolldown-based
  // Vite 8, so the plugin's type does not line up even though the plugin runs
  // correctly under both. Using @ts-expect-error rather than a cast means this
  // suppression fails the build once the two converge and it is no longer
  // needed.
  // @ts-expect-error -- Vite version skew between vitest and the project.
  plugins: [svelte()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // Svelte's client runtime lives behind the browser condition. The
    // algorithm tests run in node and are unaffected: @noble/hashes ships one
    // implementation for both.
    conditions: ['browser'],
  },
  test: {
    include: ['test/**/*.test.ts'],
    // Component tests opt into jsdom with a docblock; everything else stays
    // in node, which is faster and closer to how the crypto code is used.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
});
