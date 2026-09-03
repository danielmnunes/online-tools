# Tarefas

Estado de execução do [PRD.md](PRD.md). `[x]` feito e verificado · `[ ]` por fazer.

**Agora:** 42 ferramentas em produção, 461 testes, CI a fazer deploy automático.
**Alvo:** ~188 ferramentas. A categoria Hash está **fechada** em 21 algoritmos.

```
Hash          ████████████████████  42 / 42  (âmbito fechado)
XOF e KDF     ░░░░░░░░░░░░░░░░░░░░   0 / 35
Encoding      ░░░░░░░░░░░░░░░░░░░░   0 / 26
Format+Conv   ░░░░░░░░░░░░░░░░░░░░   0 / 20
Cryptography  ░░░░░░░░░░░░░░░░░░░░   0 / 26
Compression   ░░░░░░░░░░░░░░░░░░░░   0 / 30
Generator     ░░░░░░░░░░░░░░░░░░░░   0 / 9
                                    ─────────
                                    42 / 188
```

---

## Feito

### Fase 0 — Fundação

- [x] `git init`, scaffold Astro 7 + Svelte 5 + Tailwind 4, TypeScript `strict`
- [x] `src/tools/types.ts` — `Tool` como união discriminada por widget
- [x] `src/tools/registry.ts` — fonte de verdade para rotas, nav, sitemap, relacionados
- [x] `src/pages/[...slug].astro` com `getStaticPaths` a gerar todas as páginas
- [x] `src/pages/[category]/index.astro` — páginas de categoria
- [x] `src/layouts/BaseLayout.astro` e `ToolLayout.astro` (breadcrumb, h1, ilha, MDX, relacionados, JSON-LD)
- [x] Design system em tokens semânticos; dark mode sem flash (script inline antes do primeiro paint)
- [x] Content Collections com schema Zod; **build falha** em registry/conteúdo dessincronizados
- [x] `src/lib/encoding.ts` — UTF-8, UTF-16LE/BE, Latin-1, Hex, Base64
- [x] `wrangler.jsonc`, `public/_headers` (cache imutável + cabeçalhos de segurança)
- [x] GitHub Actions: verify em PR, deploy em `main`
- [x] Repositório público: https://github.com/danielmnunes/online-tools

### Fase 1 — Hash: texto e ficheiro (42 páginas) — âmbito fechado

- [x] Tabela de algoritmos (`src/lib/algo/hashes.ts`) — **21 algoritmos**
- [x] Ferramentas de hash **geradas** da tabela, não escritas à mão (21 → 42 páginas)
- [x] `TextHash.svelte` — encoding de entrada/saída, HMAC, recálculo automático
- [x] `FileHash.svelte` — leitura por chunks de 4 MB, progresso, cancelamento
- [x] Comparação com checksum publicado: aceita hex ou Base64, qualquer capitalização, com nome de ficheiro à cola
- [x] Primitivas de UI: `CopyButton`, `Field`, `Select`, `FileDrop`, `OutputArea`
- [x] 42 ficheiros MDX escritos de raiz, cada um com ângulo próprio, FAQ e referências
- [x] Home com cap de 8 por categoria e link "ver todas"

Algoritmos entregues: `md5` `sha1` `ripemd160` `sha224` `sha256` `double-sha256` `sha384`
`sha512` `sha512-224` `sha512-256` `sha3-224` `sha3-256` `sha3-384` `sha3-512`
`keccak-224` `keccak-256` `keccak-384` `keccak-512` `blake2b` `blake2s` `blake3`

**Fora de âmbito, por decisão:** MD2, MD4, RIPEMD-128/256/320, CRC-16/32, Adler-32, SM3,
Whirlpool e XXHash 32/64/3/128. Nenhum existe no `@noble/hashes` nem na Web Crypto, portanto
cada um exigiria implementação à mão — e quase nenhum teria paridade OpenSSL para a validar.
Ver [PRD §5.1](PRD.md).

### Verificação

- [x] Vetores publicados: RFC 1321, 3174, 2202, 4231, 7693; FIPS 180-4; FIPS 202; BLAKE3 oficiais
- [x] Paridade OpenSSL via `node:crypto` em fronteiras de bloco (388 testes)
- [x] Guarda de cobertura: algoritmo sem verificação cruzada faz a suite falhar
- [x] Testes de componente em jsdom: race guard, erros de decode, caixa de comparação
- [x] **461 testes**, `astro check` com 0 erros / 0 avisos / 0 hints
- [x] Verificação em Chrome real contra produção — os digests batem no browser, não só no Node
- [ ] Lighthouse na home e numa página de ferramenta (alvo ≥ 95)

### Deploy

- [x] Cloudflare Workers static assets — **https://online-tools.dnhub.workers.dev**
- [x] Secrets e variável configurados; deploy automático em cada push para `main`
- [x] 44 URLs do sitemap a 200; 404 a funcionar; `Cache-Control: immutable`; cabeçalhos de segurança
- [x] `robots.txt` gerado com URL de sitemap absoluto
- [x] Favicon

---

## Por fazer

### Fase 1 — opções por expor no widget

Não são algoritmos novos: são opções que os algoritmos já entregues suportam e a UI não expõe.

- [ ] **Keying nativo** para BLAKE2b/2s e BLAKE3 — não oferecem HMAC porque aceitam chave diretamente
- [ ] **Comprimento de digest variável** para os mesmos três

### Fase 2 — XOF, MAC e derivação de chaves (~35 páginas)

- [ ] `XofHash.svelte` — comprimento de saída variável, string de customização, chave
- [ ] SHAKE128/256, cSHAKE128/256, KMAC(XOF)128/256, TupleHash(XOF)128/256, ParallelHash(XOF)128/256 (`@noble/hashes/sha3-addons`)
- [ ] HMAC calculator autónomo
- [ ] `KdfTool.svelte` — PBKDF2, EvpKDF, HKDF, scrypt, Argon2
- [ ] bcrypt, scrypt e Argon2 com variante *verify*
- [ ] **Worker pool** (`src/lib/worker/pool.ts`) — Argon2 e bcrypt bloqueiam a UI thread
- [ ] Vetores SP 800-185, RFC 8018, RFC 7914, RFC 9106

### Fase 3 — Encoding (~26 páginas)

- [ ] `Codec.svelte` e `FileCodec.svelte`
- [ ] Hex/Base16, Base32, Base58, Base64 — texto e ficheiro
- [ ] Hex dump, HTML entities, URL encode/decode, URL parser
- [ ] CBOR encode/decode, JWT decoder
- [ ] Carregamento lazy das tabelas de encodings legados (ISO-8859-*, Windows-125*) — só quando escolhidos

### Fase 4 — Format e Convert (~20 páginas)

- [ ] `FormatTool.svelte` — JSON validator/minifier/formatter/viewer/compare (com repair)
- [ ] XML validator/minifier/formatter (via `DOMParser` nativo)
- [ ] Text compare, syntax highlight
- [ ] `ConvertTool.svelte` — 7 conversores de case, time converter

### Fase 5 — Criptografia (~26 páginas)

- [ ] `SymmetricCipher.svelte` — modo, padding, IV, encoding de chave
- [ ] AES, ChaCha20, ChaCha20-Poly1305 (Web Crypto + `@noble/ciphers`)
- [ ] DES, Triple DES, RC4, SPECK, XXTEA — implementação própria, com vetores NIST
- [ ] `AsymmetricTool.svelte` — RSA keygen/sign/verify/encrypt/decrypt, ECDSA keygen/sign/verify
- [ ] Aviso claro de que gerar chaves privadas num browser tem implicações

### Fase 6 — Compressão e arquivos (~30 páginas)

- [ ] `CompressionCodec.svelte` e `ArchiveTool.svelte`
- [ ] GZIP e DEFLATE via `CompressionStream` nativo
- [ ] Brotli, Zstandard, XZ, LZIP, LZMA via WASM
- [ ] ZIP e TAR create/extract com múltiplos ficheiros e download (`fflate`)
- [ ] Tudo em worker, com progresso

### Fase 7 — Geradores (~9 páginas)

- [ ] UUID v1/v3/v4/v5/v6/v7
- [ ] Gerador de passwords (`crypto.getRandomValues`, nunca `Math.random`)
- [ ] QR code generator e scanner (`getUserMedia` + `zxing-wasm`)

### Fase 8 — Polimento

- [ ] Pesquisa com Pagefind
- [ ] Suite E2E em Playwright (existe um driver validado; falta integrá-lo no CI)
- [ ] PWA/offline — as ferramentas funcionam sem rede, o que é uma vantagem real
- [ ] Orçamento de performance verificado no CI (falhar se uma página passar de 100 KB de JS)
- [ ] Auditoria de acessibilidade (labels, ordem de foco, contraste)
- [ ] Atalhos de teclado
- [ ] "Remember input" opcional em `localStorage`

---

## Decisões em aberto

- [ ] **Licença.** Sem ficheiro `LICENSE`, um repositório público é "todos os direitos reservados" por omissão. Decidir se é open source e qual.
- [ ] **Domínio próprio.** O endereço `workers.dev` funciona; um domínio próprio precisa de definir a variável `SITE_URL`.
- [ ] **`hash-wasm` para o caminho de ficheiro.** Medir se o JavaScript puro é lento demais em ficheiros de vários GB antes de decidir.
- [ ] **Topics do repositório** no GitHub, para descoberta.
