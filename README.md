# online/tools

Developer tools — hashing, encoding, ciphers, compression — that run entirely in the
visitor's browser. No backend, no uploads, no accounts.

## How it is put together

- **Astro**, static output. Every tool is a real HTML file at its own URL, which is what
  makes the site indexable and lets it deploy as plain assets on Cloudflare.
- **A registry, not pages.** `src/tools/registry.ts` is the single source of truth. It
  drives routing, navigation, breadcrumbs, related links, the sitemap and page metadata.
  Adding a tool means adding one typed entry plus one MDX file — never a new page file.
- **Svelte islands.** A handful of generic widgets serve the whole catalogue: one
  `TextHash` component backs every text hashing tool. Pages with no widget — the home
  page, category pages — ship no JavaScript at all.
- **Per-algorithm code splitting.** `src/lib/algo/impl/` holds one thin module per
  algorithm so the bundler emits one chunk each. `/md5/` downloads the MD5 code and
  nothing else, and that stays true as the catalogue grows — every algorithm on the site
  put together is under 40 KB gzipped. See the comment at the top of `src/lib/algo/hash.ts`
  for why this shaped the choice of crypto library.

## Verification

Cryptographic correctness is not something to eyeball, so it is checked three ways:

- **Published vectors** — RFC 1321, 3174, 2202, 4231, FIPS 180-4, FIPS 202, RFC 7693, and
  the BLAKE3 team's own test vectors.
- **Parity with OpenSSL** — every algorithm OpenSSL implements is compared against it
  through `node:crypto`, across lengths chosen to sit on the block boundaries where padding
  bugs live. Algorithms OpenSSL lacks (Keccak, BLAKE3) are listed explicitly in
  `test/parity.test.ts`, so adding one with no cross-check fails the suite.
- **Widget behaviour** — the components are mounted in jsdom and driven the way a person
  drives them, which covers the wiring the algorithm tests cannot see: recomputation on
  option changes, decode errors surfacing instead of stale digests, and the guard that
  stops a slow earlier hash overwriting a newer result.

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server on localhost:4321 |
| `npm run check` | Astro + TypeScript diagnostics |
| `npm test` | Vitest: published vectors, OpenSSL parity, encoding round-trips, widget behaviour in jsdom |
| `npm run build` | Static build into `dist/` |
| `npm run deploy` | Build, then `wrangler deploy` |

## Adding a tool

1. Add an entry to `TOOLS` in `src/tools/registry.ts`.
2. Add `src/content/tools/<slug>.mdx` with a description, FAQ and references.
3. If it needs a new widget kind, add an arm to the `Tool` union in `src/tools/types.ts`
   and a branch in `src/components/ToolWidget.astro`.

The build fails if a registry entry has no content file, if a content file has no registry
entry, or if a tool slug collides with a category page.

## Deployment

Static assets on Cloudflare Workers. `wrangler.jsonc` points at `dist/`; there is no Worker
script. CI needs two repository secrets — `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` — and one repository variable, `SITE_URL`, which sets the absolute
URLs in the sitemap and canonical tags.

## Licence and provenance

This project is written from scratch. It was inspired by the tool catalogue at
emn178/online-tools, whose code and content are explicitly not licensed for reuse — none
of it is copied here.
