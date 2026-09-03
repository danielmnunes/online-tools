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
  `TextHash` component backs every text hashing tool, one `XofHash` backs all sixteen
  SP 800-185 functions, one `KdfTool` backs every key-derivation page in both directions.
  Pages with no widget — the home page, category pages — ship no JavaScript at all.
- **Workers for the slow-on-purpose functions.** Argon2 and bcrypt run for seconds by
  design, so `src/lib/worker/` puts them on another thread, with progress, cancellation by
  termination, and an inline fallback where `Worker` does not exist.
- **Per-algorithm code splitting.** `src/lib/algo/impl/` holds one thin module per
  algorithm so the bundler emits one chunk each. `/md5/` downloads the MD5 code and
  nothing else, and that stays true as the catalogue grows — every algorithm on the site
  put together is under 40 KB gzipped. See the comment at the top of `src/lib/algo/hash.ts`
  for why this shaped the choice of crypto library.

## Verification

Cryptographic correctness is not something to eyeball, so it is checked several ways:

- **Published vectors** — RFCs 1321, 3174, 2202, 4231, 5869, 6070, 7693, 7914, 8018 and
  9106; FIPS 180-4 and FIPS 202; the NIST SP 800-185 samples; the BLAKE3 team's own
  vectors; and the bcrypt suite that ships with OpenBSD.
- **Parity with independent implementations** — every algorithm OpenSSL implements is
  compared against it through `node:crypto` or the command line, across lengths chosen to
  sit on the block boundaries where padding bugs live. Where OpenSSL falls short, Bouncy
  Castle and the Rust-backed Python `bcrypt` module take over. Algorithms with no
  cross-check are listed explicitly in `test/parity.test.ts`, so adding one silently fails
  the suite.
- **Re-derivation from the specification** — TupleHash and ParallelHash are rebuilt inside
  the tests from the text of SP 800-185, on top of OpenSSL's SHAKE, across parameter
  combinations no vector table covers. This is the layer that settled a disagreement
  between two implementations: Bouncy Castle's `ParallelHash.doFinal(out, off, outLen)`
  does not fold a non-default `outLen` into the `right_encode(L)` that §6.2 requires. The
  divergence is recorded in `test/vectors/sp800-185.ts`.
- **Constants derived, not transcribed** — bcrypt is the one algorithm here written from
  the specification, because no browser has Blowfish. Its 1042-word initial state is the
  hexadecimal fraction of pi, and the test suite recomputes pi with Machin's formula and
  checks every word rather than trusting a careful copy.
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

For a family with a table behind it — hashes, or the SP 800-185 functions — add the entry
to `src/lib/algo/hashes.ts` or `src/lib/algo/xofs.ts` instead and the registry generates
the pages from it.

The build fails if a registry entry has no content file, if a content file has no registry
entry, or if a tool slug collides with a category page.

## Deployment

Static assets on Cloudflare Workers. `wrangler.jsonc` points at `dist/`; there is no Worker
script. Deployed at `https://online-tools.dnhub.workers.dev`.

CI deploys on every push to `main`, but only once two repository secrets exist —
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Until then the deploy job skips with a
notice rather than failing the build. The `SITE_URL` repository variable overrides the
default site address used for canonical tags, Open Graph and the sitemap; set it when a
custom domain replaces the workers.dev one.

## Licence and provenance

This project is written from scratch. It was inspired by the tool catalogue at
emn178/online-tools, whose code and content are explicitly not licensed for reuse — none
of it is copied here.
