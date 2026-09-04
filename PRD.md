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

1. Cobertura funcional próxima da do site de referência (~188 ferramentas). As categorias
   Hash, XOF/MAC, KDF e Encoding fecham com exclusões deliberadas listadas em §5.
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
| Codificação | **@scure/base** (base16/32/58/64) e **cbor2** (RFC 8949) | Auditados, sem dependências, um módulo por função; ver §5.3 |
| Trabalho pesado | **Web Workers** com um pool próprio (`src/lib/worker/`) | Argon2 e bcrypt bloqueiam a UI thread durante segundos |
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

As ferramentas de hash e as de XOF/MAC vão mais longe: são geradas a partir das tabelas de
algoritmos (`src/lib/algo/hashes.ts`, `src/lib/algo/xofs.ts`), porque cada entrada produz
sempre o mesmo formato de ferramenta com os mesmos metadados. 21 hashes → 42 páginas; 16
funções SP 800-185 → 22. As páginas de KDF são escritas à mão, porque não têm essa
regularidade: só algumas têm página de *verify*, e três variantes do Argon2 partilham uma.

`Tool` é uma união discriminada por widget, portanto uma configuração que não corresponda ao
seu widget é erro de tipos, não uma página em branco em runtime.

### 4.2 Poucos widgets, muitas ferramentas

~15 componentes Svelte servem as ~188 ferramentas:

| Widget | Cobre | ≈ páginas |
|---|---|---|
| `TextHash` | hashes de texto | 21 |
| `FileHash` | checksums de ficheiro, por chunks, com progresso | 21 |
| `XofHash` | shake, cshake, kmac, tuplehash, parallelhash | 16 |
| `XofFile` | as variantes de ficheiro das que se streamam | 6 |
| `HmacTool` | HMAC autónomo, com escolha de hash | 1 |
| `Codec` | base16/32/58/64, html entities, percent-encoding | 12 |
| `FileCodec` | as variantes de ficheiro dos três codecs que se streamam | 6 |
| `SymmetricCipher` | aes, des, 3des, rc4, chacha20, poly1305, speck, xxtea | 16 |
| `AsymmetricTool` | rsa e ecdsa: keygen / sign / verify / encrypt / decrypt | 8 |
| `KdfTool` | pbkdf2, hkdf, evpkdf, scrypt, argon2, bcrypt (+ verify) | 12 |
| `CompressionCodec` | gzip, deflate, brotli, zstd, xz, lzip, lzma | 14 |
| `ArchiveTool` | create/extract, incluindo zip e tar | 18 |
| `FormatTool` | json, xml, text compare, syntax highlight | 10 |
| `HexDump` | hex dump de texto e de ficheiro, este por páginas | 2 |
| `CborTool` | cbor: encode/decode, notação diagnóstica, JSON | 1 |
| `JwtTool` | jwt: decode, claims no tempo, verificação de assinatura | 1 |
| `UrlParser` | componentes, parâmetros de query, notas | 1 |
| `ConvertTool` | case, time converter | 8 |
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
secção de cifras, e o **bcrypt**, já entregue), a implementação é própria, em
`src/lib/algo/legacy/`, com vetores de teste da especificação.

O bcrypt é o primeiro caso e vale como precedente. Não há Blowfish em nenhum browser, portanto
não havia atalho. Duas coisas tornaram a implementação própria aceitável em vez de temerária:
o estado inicial do Blowfish — 1042 palavras de P-array e S-boxes — é **derivado dos dígitos
hexadecimais de π** em vez de transcrito, o que elimina a maior fonte de erro de cópia; e o
resultado é verificado contra três implementações independentes (os vetores publicados do
OpenBSD, o Bouncy Castle, e o módulo `bcrypt` do Python). O teste que recalcula π e compara
palavra a palavra é o que faz da tabela algo verificado, e não algo em que se confia.

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

Em contrapartida, os algoritmos que ficam são expostos por inteiro: BLAKE2b, BLAKE2s e
BLAKE3 aceitam chave nativa — a construção que os seus autores analisaram, e não HMAC — e
produzem digests do comprimento pedido. A tabela de metadados declara os intervalos, e
`hash.ts` recusa uma chave ou um comprimento que o algoritmo não aceite em vez de os
ignorar em silêncio: receber de volta um digest sem chave é uma falha que ninguém deteta
até ser tarde.

### 5.2 Âmbito das categorias XOF/MAC e KDF

A categoria XOF/MAC fecha nas **16 funções** da FIPS 202 e da SP 800-185, mais um calculador
de HMAC autónomo. Ficam de fora o KangarooTwelve, o TurboSHAKE e o HopMAC: o noble expõe-nos,
mas o K12 tem procura orgânica quase nula e o HopMAC não tem vetores publicados — os próprios
comentários do noble dizem *use at your own risk*, e este projeto não publica uma ferramenta
que não consegue verificar.

Só seis das dezasseis ganham página de ficheiro. O TupleHash recebe um tuplo ordenado, não um
stream, e um ficheiro é um elemento só; o ParallelHash prometeria uma velocidade que em
JavaScript de uma thread não existe. As duas exclusões são de utilidade, não de capacidade.

A categoria KDF fecha em **8 funções e 12 páginas**: PBKDF2, EvpKDF, HKDF, scrypt, bcrypt e as
três variantes do Argon2, com página de *verify* para as quatro que têm um formato de
armazenamento legível. O Argon2 tem uma página de verificação para as três variantes, porque a
string PHC diz qual delas a produziu.

### 5.3 Âmbito da categoria Encoding

A categoria fecha em **6 codecs e 23 páginas**: Base16, Base32, Base58 e Base64 (texto e
ficheiro, menos o Base58), HTML entities, percent-encoding, hex dump, CBOR, JWT e URL parser.

Três decisões merecem ser escritas, porque cada uma é uma exceção à regra de "usar uma
biblioteca auditada":

- **`@scure/base` para os quatro codecs de base.** É do mesmo autor do noble, auditado pela
  cure53, e publica um módulo por codec. Não se usa a sua interpretação *sem* uma camada por
  cima: o `@scure/base` rejeita de propósito tudo o que não seja canónico — e bem, que é
  assim que nascem a maleabilidade de assinaturas e o cache poisoning — mas uma pessoa a colar
  um Base64 de um email não pediu uma verificação de canonicidade. `src/lib/codec.ts`normaliza
  primeiro (espaços, separadores, `0x`, as duas grafias do alfabeto URL-safe, o padding
  reconstruído a partir do comprimento) e só depois descodifica em modo estrito. O que continua
  a falhar é input genuinamente partido: um caráter fora do alfabeto, um comprimento que
  nenhuma codificação podia ter produzido, ou bits no fim que o padding diz serem zero.
- **HTML entities são descodificadas pelo browser.** A alternativa é transcrever as 2 231
  referências nomeadas do HTML5, o que daria uma segunda cópia pior de uma tabela que o runtime
  já tem — e que é a que vai ser aplicada ao resultado. O `<` literal é escapado antes de
  interpretar, o que é o que torna isso seguro: sem `<` na entrada, o parser só pode produzir
  nós de texto. Nenhum elemento, nenhum script, nenhum pedido de rede. Verificado no Chrome.
- **Percent-encoding escrito à mão, com quatro modos.** Não porque fosse difícil usar
  `encodeURIComponent`, mas porque este widget codifica *bytes* vindos de uma caixa de hex, o
  que uma função de strings nunca vê, e porque os quatro contextos (componente, URL inteira,
  form, estrito) têm quatro conjuntos de caracteres por escapar. Os quatro são comparados com
  `encodeURIComponent`, `encodeURI` e o serializador urlencoded da plataforma.

**Fora de âmbito:** o Base58 não tem página de ficheiro — a conversão entre bases 256 e 58 é
quadrática no comprimento da entrada (2 KiB é instantâneo, 1 MB não é), e uma página cujo
alcance útil fosse dois quilobytes não é uma ferramenta. HTML entities e percent-encoding
também não: são transformações de texto. E as tabelas de encodings legados
(ISO-8859-\*, Windows-125\*) ficaram de fora por uma razão que mudou desde que foram
escritas nos planos: o browser **descodifica** todos esses charsets nativamente, sem
descarregar nada, e a única direção que precisa mesmo de tabelas — codificar *para* um charset
legado — não tem procura que justifique trinta tabelas transcritas, que é a maior fonte de erro
de cópia que existe.

---

## 6. Verificação

Correção criptográfica não se verifica a olho. Três camadas independentes:

1. **Vetores publicados** — RFC 1321, 3174, 2202, 4231, 5869, 6070, 7693, 7914, 8018, 9106;
   FIPS 180-4, FIPS 202; SP 800-185; os vetores oficiais da equipa BLAKE3; os vetores do
   bcrypt distribuídos com o OpenBSD; a §10 da RFC 4648 (Base16/32/64), o Apêndice A da
   RFC 8949 (CBOR, na íntegra) e a §A.1 da RFC 7515 (JWS).
2. **Paridade com implementações independentes.** O OpenSSL, através do `node:crypto` e da
   linha de comandos, é o oráculo principal — não partilha código com o noble. Onde não chega,
   entram o Bouncy Castle 1.83 (SP 800-185, Argon2, bcrypt) e o módulo `bcrypt` do Python. Para
   a codificação, as plataformas: `Buffer` no Base64 e no hex, `encodeURIComponent`, `encodeURI`
   e `URLSearchParams` no percent-encoding, `hexdump -C` no hex dump (quando existe), e
   `node:crypto` a assinar os tokens que o verificador da página tem de aceitar e rejeitar. Os
   comprimentos são escolhidos para cair nas fronteiras de bloco
   (0, 1, 55, 56, 63, 64, 65, 71, 72, 111, 112, 127, 128, 135, 136, 137, 1000, 4096), que é
   onde vivem os bugs de padding. Os algoritmos que o OpenSSL não tem estão listados
   explicitamente: **adicionar um algoritmo sem verificação cruzada faz a suite falhar**.
3. **Re-derivação da especificação**, onde nenhuma das duas primeiras chega. O TupleHash e o
   ParallelHash são reconstruídos dentro dos testes a partir do texto da SP 800-185 — com o

   `left_encode`, o `right_encode` e o `encode_string` escritos à mão sobre o SHAKE do OpenSSL
   — e comparados em combinações de parâmetros que nenhuma tabela de vetores cobre. Foi esta
   camada que resolveu uma discordância entre duas implementações: o
   `ParallelHash.doFinal(out, off, outLen)` do Bouncy Castle não codifica um `outLen`
   não-predefinido no `right_encode(L)` que a §6.2 exige. O noble está certo, e a divergência
   ficou registada em `test/vectors/sp800-185.ts` para quem vier a seguir. A mesma ideia, mais
   simples, valida os alfabetos de Base32: os três são transcritos da RFC 4648 e da página do
   Crockford, e a codificação de cada grupo de cinco bits é calculada no teste, o que verifica
   o alfabeto e a ordem dos bits contra algo escrito noutro sítio. O checksum do Base58Check é
   recalculado com SHA-256 dentro do teste em vez de ser confiado à biblioteca.
4. **Comportamento dos widgets** em jsdom — recálculo ao mudar opções, erros de
   descodificação a aparecerem em vez de resultados obsoletos, e o guard que impede um
   cálculo lento antigo de sobrescrever um resultado mais recente.
5. **Guardas estruturais do registry** — slugs únicos, links relacionados que resolvem,
   configuração que bate com a tabela do algoritmo, e uma página por codec e direção. Um erro
   aqui não parte o build: produz uma página que renderiza e está errada, que é o pior tipo.
6. **Um browser real**, no fim. jsdom não tem Web Crypto nem `URL.createObjectURL`, e é aí que
   vivem duas das coisas mais fáceis de errar: a verificação de assinaturas e os downloads.
   Chrome é apontado ao build de produção por CDP e verifica-se no browser — não só em Node —
   que a chave da RFC 7515 valida o token da RFC 7515, e que largar um ficheiro numa página de
   Base64 produz um download `blob:` sem um único pedido à rede.

---

## 7. Orçamento de performance

| Métrica | Alvo | Estado atual |
|---|---|---|
| JS na home e páginas de categoria | 0 KB | **0 KB, 0 ilhas** |
| Transferido numa página de ferramenta | < 100 KB gz | **35 KB gz** no máximo (a `/cbor/`, que carrega o cbor2 inteiro) |
| Trabalho pesado fora da main thread | sempre | Argon2id a 19 MiB: 571 ms, **0 ms** de bloqueio |
| Crescimento por algoritmo adicionado | ~0 nas outras páginas | confirmado |
| Pedidos a hosts externos | 0 | **0** |
| Lighthouse (Performance, SEO, A11y, Best Practices) | ≥ 95 | **100** na home e em `/md5/` |

---

## 8. Catálogo-alvo (~188 ferramentas)

| Categoria | Ferramentas |
|---|---|
| **Hash** | MD5, SHA-1, SHA-2 (224/256/384/512/512-224/512-256), Double SHA-256, SHA-3 (×4), Keccak (×4), RIPEMD-160, BLAKE2b/2s, BLAKE3 — cada um com variante de ficheiro. **Entregue.** Exclusões em §5 |
| **XOF e MAC** | SHAKE128/256, cSHAKE128/256, KMAC(XOF)128/256, TupleHash(XOF)128/256, ParallelHash(XOF)128/256, HMAC calculator — com variante de ficheiro nas seis que se streamam. **Entregue.** Exclusões em §5.2 |
| **KDF** | PBKDF2, EvpKDF, HKDF, scrypt, Argon2d/i/id; PBKDF2/scrypt/bcrypt/Argon2 com variante *verify*. **Entregue.** Ver §5.2 |
| **Encoding** | Hex/Base16, Base32, Base58, Base64 (texto e ficheiro), Hex dump (texto e ficheiro), HTML entities, URL encode/decode, URL parser, CBOR, JWT decoder. **Entregue.** Exclusões em §5.3 |
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
