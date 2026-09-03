# PRD — online/tools

Ferramentas de programador que correm inteiramente no browser: hashing, encoding, cifras,
compressão, formatação e geradores. Sem backend, sem uploads, sem contas.

**Produção:** https://online-tools.dnhub.workers.dev
**Referência de catálogo:** [emn178/online-tools](https://github.com/emn178/online-tools) ·
[site](https://emn178.github.io/online-tools)

---

## 1. Problema e objetivo

Existe uma categoria de ferramentas — calcular um MD5, descodificar um Base64, formatar um
JSON — que toda a gente usa e quase ninguém pensa duas vezes antes de colar lá dentro uma
password, uma chave privada ou um ficheiro de cliente. A maioria dos sites que as oferecem
envia esse conteúdo para um servidor.

O objetivo é um site com o mesmo catálogo de funcionalidades, onde **nada sai da máquina do
utilizador** — e onde essa afirmação é verificável abrindo o separador de rede.

### Objetivos

1. Cobertura funcional próxima da do site de referência (~188 ferramentas). A categoria Hash
   fecha em 21 algoritmos, com exclusões deliberadas listadas em §5.
2. Processamento 100% client-side, sem exceções.
3. Cada ferramenta num URL próprio, com HTML estático real — o tráfego desta categoria vem
   de pesquisa orgânica ("md5 online", "base64 decode").
4. Orçamento de performance por página que **não cresce** com o tamanho do catálogo.
5. Correção criptográfica demonstrável, não assumida.

### Não-objetivos

- Contas, histórico, sincronização entre dispositivos.
- API pública ou uso programático.
- Processamento server-side de qualquer espécie.
- Ferramentas que exijam segredos do lado do servidor.

---

## 2. Restrição legal

A `LICENSE` do `emn178/online-tools` declara explicitamente que *"the website content,
generated files, and private source project are not licensed for reuse, redistribution,
modification, or derivative works"*.

**Consequência vinculativa:** não copiar HTML, CSS, JavaScript, imagens, nem os textos
descritivos e FAQ desse site. O projeto usa-o apenas como referência de *que ferramentas
existem* e de *como se comportam* — funcionalidade e algoritmos (RFCs, NIST FIPS) não são
protegidos por direitos de autor. Todo o código, design e conteúdo é escrito de raiz.

---

## 3. Stack

| Camada | Escolha | Razão |
|---|---|---|
| Framework | **Astro 7**, `output: 'static'` | Zero JS por defeito, ilhas, file-based routing, Content Collections |
| Ilhas interativas | **Svelte 5** (runes) | Runtime mínimo; ~2x menor que React para o mesmo widget |
| Estilos | **Tailwind CSS 4** (`@tailwindcss/vite`) | Sem CSS runtime; dark mode por classe |
| Conteúdo SEO | **MDX + Content Collections** (schema Zod) | Prosa e FAQ versionados e validados no build |
| Criptografia | **@noble/hashes** e, onde faltar, implementação própria | Ver §5 |
| Linguagem | TypeScript `strict` | O registry só funciona se for tipado |
| Testes | **Vitest** + **jsdom** + `@testing-library/svelte` | Vetores, paridade, e comportamento dos widgets |
| Deploy | **Cloudflare Workers static assets** + Wrangler | Via recomendada pela Cloudflare e pelo Astro para projetos novos |
| CI | GitHub Actions | Verifica em PR, deploy automático em `main` |

**Astro em vez de um SPA:** o problema real deste site é *200 páginas, cada uma a precisar de
uma biblioteca criptográfica diferente*. Astro envia zero JS por defeito e hidrata apenas a
ilha daquela página. Num SPA (Next, SvelteKit) paga-se o runtime do router em todas as
páginas, para um site que é essencialmente HTML estático com um widget cada.

---

## 4. Arquitetura

### 4.1 O registry é a fonte de verdade

`src/tools/registry.ts` gera **rotas, navegação, breadcrumbs, links relacionados, sitemap,
índice de pesquisa e metadados**. Adicionar uma ferramenta é adicionar uma entrada tipada,
nunca escrever uma página.

As ferramentas de hash vão mais longe: são geradas a partir da tabela de algoritmos
(`src/lib/algo/hashes.ts`), porque cada algoritmo produz sempre uma ferramenta de texto e uma
de ficheiro com os mesmos metadados. 21 entradas na tabela → 42 páginas.

`Tool` é uma união discriminada por widget, portanto uma configuração que não corresponda ao
seu widget é erro de tipos, não uma página em branco em runtime.

### 4.2 Poucos widgets, muitas ferramentas

~13 componentes Svelte servem as ~188 ferramentas:

| Widget | Cobre | ≈ páginas |
|---|---|---|
| `TextHash` | hashes de texto | 21 |
| `FileHash` | checksums de ficheiro, por chunks, com progresso | 21 |
| `XofHash` | shake, cshake, kmac, tuplehash, parallelhash | 22 |
| `Codec` | base16/32/58/64, html, url, cbor | 16 |
| `FileCodec` | as variantes de ficheiro dos codecs | 10 |
| `SymmetricCipher` | aes, des, 3des, rc4, chacha20, poly1305, speck, xxtea | 16 |
| `AsymmetricTool` | rsa e ecdsa: keygen / sign / verify / encrypt / decrypt | 8 |
| `KdfTool` | pbkdf2, hkdf, evpkdf, scrypt, argon2, bcrypt (+ verify) | 12 |
| `CompressionCodec` | gzip, deflate, brotli, zstd, xz, lzip, lzma | 14 |
| `ArchiveTool` | create/extract, incluindo zip e tar | 18 |
| `FormatTool` | json, xml, text compare, syntax highlight | 10 |
| `ConvertTool` | case, time converter, url parser, jwt decoder | 10 |
| `GeneratorTool` | uuid v1–v7, password, qr code | 9 |

Comportamento partilhado implementado uma vez em `src/lib/`: conversão de encodings,
worker pool para operações pesadas, leitura de ficheiros por chunks.

### 4.3 Code splitting por algoritmo

`src/lib/algo/impl/` tem um módulo fino por algoritmo, cuja única função é fazer o bundler
emitir um chunk separado. `/md5/` descarrega o código do MD5 e mais nada, e isso mantém-se
verdade à medida que o catálogo cresce.

### 4.4 Conteúdo e SEO

`src/content/tools/<slug>.mdx` com schema Zod: `description`, `faq`, `references`, e corpo
em prosa. Daí saem `<title>`, meta description, Open Graph e JSON-LD
(`SoftwareApplication` + `FAQPage`).

**O build falha** se uma entrada do registry não tiver ficheiro de conteúdo, se um ficheiro
de conteúdo não tiver entrada no registry, ou se um slug colidir com uma página de categoria.

---

## 5. Decisão criptográfica

A escolha inicial foi `hash-wasm`, pela velocidade. **Foi medida e rejeitada.**

O `hash-wasm` publica um único ficheiro ESM com os 22 módulos WebAssembly embutidos em
base64. Um bundler consegue fazer tree-shaking mas **não consegue dividi-lo**, porque
chunking é por módulo e ali há só um. Resultado: qualquer página de hash descarregaria o
código de todos os algoritmos — cerca de **84 KB gzipped** com o catálogo completo.

`@noble/hashes` publica um módulo por família com `sideEffects: false`. Medido no build real:

| | hash-wasm | @noble/hashes |
|---|---|---|
| JS por página de hash | ~84 KB gz (todo o catálogo) | ~4 KB gz (só a família) |
| Cresce com o catálogo? | Sim | **Não** |
| Todos os 21 algoritmos juntos | — | 37.7 KB gz |

O custo é throughput em ficheiros grandes: noble é JavaScript puro, várias vezes mais lento
que WebAssembly. É um custo real e está documentado no topo de `src/lib/algo/hash.ts`. Se o
hashing de ficheiros se provar demasiado lento, o caminho de ficheiro — e só esse — pode
carregar o build WASM, decidido com números e não por antecipação.

Onde nem o noble nem a Web Crypto cobrem um algoritmo (DES, RC4, SPECK, XXTEA — todos da
secção de cifras), a implementação é própria, em `src/lib/algo/legacy/`, com vetores de
teste da especificação.

### 5.1 Âmbito da categoria Hash

A categoria fecha nos **21 algoritmos** que o `@noble/hashes` e a Web Crypto cobrem. Ficam
deliberadamente de fora MD2, MD4, RIPEMD-128/256/320, CRC-16/32, Adler-32, SM3, Whirlpool e
XXHash 32/64/3/128.

O que essa decisão troca, dito de forma direta: perde-se procura orgânica real
("crc32 online", "sm3 online"). O que se evita são catorze implementações escritas à mão, a
maioria sem a rede de segurança que §6 exige de tudo o resto — o OpenSSL 3 não expõe MD2,
MD4 nem Whirlpool fora do *legacy provider*, e nunca teve RIPEMD-128/256/320, pelo que a
verificação assentaria só em vetores da especificação (a exceção é o SM3, que o `node:crypto`
cobre). O XXH3/XXH128, por sua vez, obrigaria a trazer de volta o `hash-wasm` rejeitado
acima.

Se a decisão for revertida, o caminho está descrito: entrada na tabela de `hashes.ts`,
módulo em `impl/`, MDX, e registo explícito em `VERIFIED_ELSEWHERE` — a guarda de cobertura
dos testes obriga a essa declaração.

---

## 6. Verificação

Correção criptográfica não se verifica a olho. Três camadas independentes:

1. **Vetores publicados** — RFC 1321, 3174, 2202, 4231, 7693; FIPS 180-4, FIPS 202;
   SP 800-185; e os vetores oficiais da equipa BLAKE3.
2. **Paridade com o OpenSSL**, através do `node:crypto` — uma implementação sem código em
   comum com o noble — em comprimentos escolhidos para cair nas fronteiras de bloco
   (0, 1, 55, 56, 63, 64, 65, 71, 72, 111, 112, 127, 128, 135, 136, 137, 1000, 4096), que é
   onde vivem os bugs de padding. Os algoritmos que o OpenSSL não tem estão listados
   explicitamente: **adicionar um algoritmo sem verificação cruzada faz a suite falhar**.
3. **Comportamento dos widgets** em jsdom — recálculo ao mudar opções, erros de
   descodificação a aparecerem em vez de digests obsoletos, e o guard que impede um hash
   lento antigo de sobrescrever um resultado mais recente.

---

## 7. Orçamento de performance

| Métrica | Alvo | Estado atual |
|---|---|---|
| JS na home e páginas de categoria | 0 KB | **0 KB, 0 ilhas** |
| Transferido numa página de ferramenta | < 100 KB gz | **~38 KB gz** |
| Crescimento por algoritmo adicionado | ~0 nas outras páginas | confirmado |
| Pedidos a hosts externos | 0 | **0** |
| Lighthouse (Performance, SEO, A11y) | ≥ 95 | por medir |

---

## 8. Catálogo-alvo (~188 ferramentas)

| Categoria | Ferramentas |
|---|---|
| **Hash** | MD5, SHA-1, SHA-2 (224/256/384/512/512-224/512-256), Double SHA-256, SHA-3 (×4), Keccak (×4), RIPEMD-160, BLAKE2b/2s, BLAKE3 — cada um com variante de ficheiro. **Entregue.** Exclusões em §5 |
| **XOF e MAC** | SHAKE128/256, cSHAKE128/256, KMAC(XOF)128/256, TupleHash(XOF)128/256, ParallelHash(XOF)128/256, HMAC calculator |
| **KDF** | PBKDF2, EvpKDF, HKDF, scrypt, Argon2; bcrypt/scrypt/Argon2 com variante *verify* |
| **Encoding** | Hex/Base16, Base32, Base58, Base64 (texto e ficheiro), Hex dump, HTML entities, URL encode/decode, URL parser, CBOR, JWT decoder |
| **Format** | JSON validator/minifier/formatter/viewer/compare, XML validator/minifier/formatter, text compare, syntax highlight |
| **Convert** | 7 conversores de case, time converter |
| **Cryptography** | AES, DES, Triple DES, RC4, ChaCha20, ChaCha20-Poly1305, SPECK, XXTEA (encrypt/decrypt); ECDSA e RSA (keygen/sign/verify/encrypt/decrypt) |
| **Compression** | GZIP, DEFLATE, Brotli, Zstandard, XZ, LZIP, LZMA (compress/decompress e create/extract), ZIP, TAR |
| **Generator** | UUID v1/v3/v4/v5/v6/v7, gerador de passwords, QR code generator e scanner |

O estado de execução por fase está em [tasks.md](tasks.md).

---

## 9. Deploy

Assets estáticos em Cloudflare Workers. `wrangler.jsonc` aponta para `dist/`; não existe
script de Worker. `public/_headers` define `Cache-Control: immutable` para `/_astro/*`
(nomes com hash) e os cabeçalhos de segurança.

O CI verifica em cada PR (`astro check`, testes, build) e faz deploy em cada push para
`main`. O job de deploy está condicionado à existência das credenciais: sem elas faz *skip*
com um aviso, em vez de falhar o build.

**Configuração:** secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`; variável
`SITE_URL` (apenas necessária quando um domínio próprio substituir o endereço workers.dev).
