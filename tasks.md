# Tarefas

Estado de execução do [PRD.md](PRD.md). `[x]` feito e verificado · `[ ]` por fazer.

**Agora:** 77 ferramentas em produção, 890 testes, CI a fazer deploy automático.
**Alvo:** ~188 ferramentas. A categoria Hash está **fechada** em 21 algoritmos.

```
Hash          ████████████████████  42 / 42  (âmbito fechado)
XOF e MAC     ████████████████████  23 / 23  (âmbito fechado)
KDF           ████████████████████  12 / 12  (âmbito fechado)
Encoding      ░░░░░░░░░░░░░░░░░░░░   0 / 26
Format+Conv   ░░░░░░░░░░░░░░░░░░░░   0 / 20
Cryptography  ░░░░░░░░░░░░░░░░░░░░   0 / 26
Compression   ░░░░░░░░░░░░░░░░░░░░   0 / 30
Generator     ░░░░░░░░░░░░░░░░░░░░   0 / 9
                                    ─────────
                                    77 / 188
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
- [x] **Keying nativo** para BLAKE2b/2s e BLAKE3, distinto de HMAC e recusado onde não se aplica
- [x] **Comprimento de digest variável** para os mesmos três, nos dois widgets
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
- [x] Vetores oficiais BLAKE3 para *keyed hash* e saída estendida a 131 bytes
- [x] BLAKE2 com chave contra o OpenSSL (`BLAKE2BMAC`/`BLAKE2SMAC`) e o `b2sum` do coreutils
- [x] **497 testes**, `astro check` com 0 erros / 0 avisos / 0 hints
- [x] Verificação em Chrome real contra produção — os digests batem no browser, não só no Node
- [x] Lighthouse: **100** em Performance, Acessibilidade, Best Practices e SEO, na home e em `/md5/`
      (a primeira medição deu 96 de acessibilidade em `/md5/`: contraste de 4.19:1 no texto de
      12 px do `OutputArea`, e o botão de tema com um nome acessível que não continha o texto
      visível — ambos corrigidos)

### Fase 2 — XOF, MAC e derivação de chaves (35 páginas) — âmbito fechado

- [x] Tabela de funções SP 800-185 (`src/lib/algo/xofs.ts`) — **16 funções**, cada flag da tabela
      liga um controlo do widget, sem ramos por algoritmo no componente
- [x] `XofHash.svelte` — comprimento variável, string de customização S, function name N,
      chave, block size B, e editor de tuplos para o TupleHash
- [x] `XofFile.svelte` — as seis funções que se streamam (SHAKE, cSHAKE, KMAC), por chunks
- [x] SHAKE128/256, cSHAKE128/256, KMAC(XOF)128/256, TupleHash(XOF)128/256,
      ParallelHash(XOF)128/256 — 16 páginas de texto + 6 de ficheiro
- [x] HMAC calculator autónomo, com caixa de comparação que aceita o prefixo `sha256=`
- [x] `KdfTool.svelte` — PBKDF2, EvpKDF, HKDF, scrypt, bcrypt, Argon2d/i/id
- [x] Variante *verify* para PBKDF2, scrypt, bcrypt e Argon2 (uma página para as três variantes)
- [x] **bcrypt escrito de raiz** (`src/lib/algo/legacy/bcrypt.ts`) — não existe no noble nem na
      Web Crypto; o estado inicial do Blowfish é **derivado de π**, não transcrito
- [x] `src/lib/phc.ts` — strings PHC (Argon2, scrypt) e o formato do Django (PBKDF2)
- [x] **Worker pool** (`src/lib/worker/pool.ts`) com fallback inline onde não há `Worker`
- [x] Argon2 com `key` (pepper) e `associatedData` de RFC 9106, expostos no widget
- [x] 35 ficheiros MDX escritos de raiz, cada um com ângulo próprio, FAQ e referências

Funções entregues: `shake128` `shake256` `cshake128` `cshake256` `kmac128` `kmac256`
`kmacxof128` `kmacxof256` `tuplehash128` `tuplehash256` `tuplehashxof128` `tuplehashxof256`
`parallelhash128` `parallelhash256` `parallelhashxof128` `parallelhashxof256` `hmac`
`pbkdf2` `evpkdf` `hkdf` `scrypt` `bcrypt` `argon2d` `argon2i` `argon2id`

**Fora de âmbito, por decisão:** KangarooTwelve, TurboSHAKE e HopMAC. O noble expõe-nos, mas
o K12 tem procura orgânica quase nula e o HopMAC não tem vetores publicados — os próprios
comentários do noble dizem "use at your own risk". Ficheiros para TupleHash e ParallelHash
também não: o primeiro recebe um tuplo e não um stream, e o segundo prometia um paralelismo
que em JavaScript não existe.

### Verificação da Fase 2

- [x] SHAKE contra o OpenSSL via `node:crypto`, em fronteiras de rate (136 e 168 bytes) e em
      vários comprimentos de saída
- [x] Vetores SP 800-185 gerados com **Bouncy Castle 1.83** e confirmados três vezes: batem com
      os *samples* publicados pelo NIST, o KMAC bate com `openssl mac`, e o cSHAKE com strings
      vazias bate com o SHAKE do OpenSSL
- [x] **TupleHash e ParallelHash re-derivados da especificação** dentro dos testes, sobre o SHAKE
      do OpenSSL, em parâmetros que nenhuma tabela de vetores cobre
- [x] Encontrado um bug real no Bouncy Castle: `ParallelHash.doFinal(out, off, outLen)` não
      codifica um `outLen` não-predefinido no `right_encode(L)` que a §6.2 exige. O noble está
      certo; ficou documentado em `test/vectors/sp800-185.ts`
- [x] PBKDF2, HKDF e scrypt contra o OpenSSL via `node:crypto`; os quatro Keccak, que o OpenSSL
      não tem, contra a RFC 8018 escrita à mão no teste
- [x] Vetores RFC 6070, RFC 5869, RFC 7914 e RFC 9106 (estes com *secret* e *associated data*)
- [x] EvpKDF contra a linha de comandos `openssl enc -P`, com o comando registado ao lado
- [x] bcrypt: os vetores publicados do OpenBSD, paridade com o Bouncy Castle **e** com o módulo
      `bcrypt` do Python, e um teste que recalcula os dígitos hexadecimais de π e compara os
      1042 valores do estado inicial do Blowfish
- [x] Worker pool testado com um `Worker` falso: fila, progresso, cancelamento por `terminate()`,
      e o worker novo que nasce a seguir
- [x] Testes de componente para os três widgets novos, incluindo o editor de tuplos
- [x] Guardas estruturais do registry: slugs únicos, links relacionados que resolvem, config que
      bate com a tabela do algoritmo
- [x] **890 testes**, `astro check` com 0 erros / 0 avisos / 0 hints
- [x] Verificação em Chrome real contra o build: o KMAC bate com o *sample* do NIST, o bcrypt com
      o vetor do OpenBSD, e o Argon2id com o `node:crypto` local — no browser, não só no Node
- [x] Worker confirmado no browser: 571 ms de Argon2id a 19 MiB **sem bloquear** a main thread,
      progresso a subir, cancelamento a matar o worker e o seguinte a nascer limpo
- [x] Contraste e nomes acessíveis verificados nos dois temas: 0 falhas

### Deploy

- [x] Cloudflare Workers static assets — **https://online-tools.dnhub.workers.dev**
- [x] Secrets e variável configurados; deploy automático em cada push para `main`
- [x] 44 URLs do sitemap a 200; 404 a funcionar; `Cache-Control: immutable`; cabeçalhos de segurança
- [x] `robots.txt` gerado com URL de sitemap absoluto
- [x] Favicon

---

## Por fazer

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
