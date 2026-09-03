/**
 * bcrypt, written from the specification.
 *
 * Neither @noble/hashes nor the Web Crypto API has bcrypt, and unlike the
 * hashes in §5 of the PRD there is no way to reach it from the platform: it is
 * Blowfish with a key schedule the algorithm deliberately makes expensive, and
 * Blowfish is not a primitive any browser exposes. So this is the site's first
 * hand-written cipher.
 *
 * Two things make that acceptable. The initial state is derived from pi rather
 * than transcribed (see blowfish-state.ts), so the largest source of
 * copy errors is gone; and the result is checked against two independent
 * implementations -- Bouncy Castle and the Rust-backed Python `bcrypt` module
 * -- across costs, salts, empty passwords and the 72-byte truncation edge.
 *
 * Reference: Provos and Mazieres, "A Future-Adaptable Password Scheme",
 * USENIX 1999, and OpenBSD's blowfish.c / bcrypt.c.
 */
import { INITIAL_STATE, P_WORDS, S_BOX_WORDS } from './blowfish-state';

/** bcrypt's own base64 alphabet, which is not the base64 alphabet. */
const ALPHABET = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** The 24 bytes bcrypt encrypts to produce its digest: "OrpheanBeholderScryDoubt". */
const MAGIC = Uint32Array.of(0x4f727068, 0x65616e42, 0x65686f6c, 0x64657253, 0x63727944, 0x6f756274);

/** Salt length in bytes. Not adjustable: it is baked into the string format. */
export const SALT_BYTES = 16;

/**
 * Passwords longer than this are cut off.
 *
 * A real and frequently missed property: bcrypt's key schedule reads at most
 * 72 bytes, so two passwords sharing their first 72 bytes hash identically.
 * The tool says so rather than letting a user believe a 100-character
 * passphrase bought them anything past character 72.
 */
export const MAX_PASSWORD_BYTES = 72;

/** Prefixes this implementation accepts. All three key the same way. */
export type BcryptVersion = '2a' | '2b' | '2y';

const VERSIONS: ReadonlyArray<BcryptVersion> = ['2a', '2b', '2y'];

export const MIN_COST = 4;
export const MAX_COST = 31;

interface State {
  readonly p: Uint32Array;
  readonly s: Uint32Array;
}

function initialState(): State {
  return {
    p: INITIAL_STATE.slice(0, P_WORDS),
    s: INITIAL_STATE.slice(P_WORDS),
  };
}

/**
 * Blowfish's F function: four S-box lookups combined with additions and one
 * XOR, which is where the cipher's key-dependence lives.
 */
function f({ s }: State, x: number): number {
  const a = s[(x >>> 24) & 0xff]!;
  const b = s[S_BOX_WORDS + ((x >>> 16) & 0xff)]!;
  const c = s[S_BOX_WORDS * 2 + ((x >>> 8) & 0xff)]!;
  const d = s[S_BOX_WORDS * 3 + (x & 0xff)]!;
  return (((((a + b) >>> 0) ^ c) >>> 0) + d) >>> 0;
}

/**
 * One 64-bit Blowfish block, sixteen rounds, encrypted in place into `block`.
 *
 * Written against OpenBSD's Blowfish_encipher, which folds the final swap
 * into the way the two halves are written back.
 */
function encipher(state: State, block: Uint32Array, offset: number): void {
  const { p } = state;
  let xl = block[offset]! ^ p[0]!;
  let xr = block[offset + 1]!;

  for (let i = 1; i <= 16; i += 2) {
    xr = (xr ^ f(state, xl) ^ p[i]!) >>> 0;
    xl = (xl ^ f(state, xr) ^ p[i + 1]!) >>> 0;
  }

  block[offset] = (xr ^ p[17]!) >>> 0;
  block[offset + 1] = xl;
}

/**
 * Reads the next 32 bits from `data`, wrapping round when it runs out.
 *
 * The cycling is not a convenience: bcrypt's key schedule keeps drawing from
 * a key that is almost always shorter than what it consumes, and the position
 * carries across calls, which is why the cursor is passed in and out.
 */
function streamWord(data: Uint8Array, cursor: { at: number }): number {
  let word = 0;
  for (let i = 0; i < 4; i++) {
    if (data.length === 0) return 0;
    word = ((word << 8) | data[cursor.at]!) >>> 0;
    cursor.at = (cursor.at + 1) % data.length;
  }
  return word;
}

/**
 * The expensive key schedule: XOR the key into P, then re-derive every word of
 * P and S by encrypting a running block, with `data` folded in.
 *
 * With `data` empty this is OpenBSD's Blowfish_expand0state; with a salt it is
 * Blowfish_expandstate. bcrypt alternates the two 2^cost times, and that
 * alternation is the entire cost function.
 */
function expandState(state: State, data: Uint8Array, key: Uint8Array): void {
  const { p, s } = state;

  const keyCursor = { at: 0 };
  for (let i = 0; i < P_WORDS; i++) {
    p[i] = (p[i]! ^ streamWord(key, keyCursor)) >>> 0;
  }

  const dataCursor = { at: 0 };
  const block = Uint32Array.of(0, 0);

  for (let i = 0; i < P_WORDS; i += 2) {
    block[0] = (block[0]! ^ streamWord(data, dataCursor)) >>> 0;
    block[1] = (block[1]! ^ streamWord(data, dataCursor)) >>> 0;
    encipher(state, block, 0);
    p[i] = block[0]!;
    p[i + 1] = block[1]!;
  }

  for (let box = 0; box < 4; box++) {
    for (let i = 0; i < S_BOX_WORDS; i += 2) {
      block[0] = (block[0]! ^ streamWord(data, dataCursor)) >>> 0;
      block[1] = (block[1]! ^ streamWord(data, dataCursor)) >>> 0;
      encipher(state, block, 0);
      s[box * S_BOX_WORDS + i] = block[0]!;
      s[box * S_BOX_WORDS + i + 1] = block[1]!;
    }
  }
}

/** The key as the schedule sees it: truncated to 72 bytes, then NUL-terminated. */
function keyBytes(password: Uint8Array): Uint8Array {
  const used = Math.min(password.length, MAX_PASSWORD_BYTES);
  const key = new Uint8Array(used + 1);
  key.set(password.subarray(0, used));
  return key;
}

export interface BcryptOptions {
  /** Called with 0..1 as the key schedule runs, so a cost of 15 can show progress. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * The 23 raw digest bytes, given a 16-byte salt.
 *
 * Async because at cost 14 and up this runs for seconds, and yielding lets a
 * caller both paint a progress bar and honour a cancellation. The yields cost
 * nothing measurable next to the work between them.
 */
export async function bcryptRaw(
  password: Uint8Array,
  salt: Uint8Array,
  cost: number,
  { onProgress, signal }: BcryptOptions = {},
): Promise<Uint8Array> {
  if (!Number.isInteger(cost) || cost < MIN_COST || cost > MAX_COST) {
    throw new Error(`bcrypt cost must be an integer from ${MIN_COST} to ${MAX_COST}; got ${cost}.`);
  }
  if (salt.length !== SALT_BYTES) {
    throw new Error(`bcrypt needs a ${SALT_BYTES}-byte salt; got ${salt.length}.`);
  }

  const key = keyBytes(password);
  const state = initialState();
  expandState(state, salt, key);

  const rounds = 2 ** cost;
  // Yield about a hundred times over the whole schedule regardless of cost,
  // so the progress bar moves at the same rate at 4 as at 16.
  const step = Math.max(1, Math.floor(rounds / 100));

  for (let i = 0; i < rounds; i++) {
    expandState(state, new Uint8Array(0), key);
    expandState(state, new Uint8Array(0), salt);

    if (i % step === step - 1) {
      if (signal?.aborted) throw new DOMException('Hashing cancelled.', 'AbortError');
      onProgress?.((i + 1) / rounds);
      await Promise.resolve();
    }
  }
  onProgress?.(1);

  const block = MAGIC.slice();
  for (let round = 0; round < 64; round++) {
    for (let i = 0; i < block.length; i += 2) encipher(state, block, i);
  }

  // 24 bytes come out; bcrypt discards the last one, an oddity of the original
  // implementation that every compatible one has had to keep.
  const out = new Uint8Array(23);
  for (let i = 0; i < 23; i++) {
    out[i] = (block[i >> 2]! >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

/** bcrypt's base64: same idea as RFC 4648, different alphabet and no padding. */
export function encodeBase64(bytes: Uint8Array, length: number): string {
  let out = '';
  let i = 0;
  while (i < length) {
    let c1 = bytes[i++]!;
    out += ALPHABET[(c1 >> 2) & 0x3f];
    c1 = (c1 & 0x03) << 4;
    if (i >= length) {
      out += ALPHABET[c1 & 0x3f];
      break;
    }
    let c2 = bytes[i++]!;
    c1 |= (c2 >> 4) & 0x0f;
    out += ALPHABET[c1 & 0x3f];
    c1 = (c2 & 0x0f) << 2;
    if (i >= length) {
      out += ALPHABET[c1 & 0x3f];
      break;
    }
    c2 = bytes[i++]!;
    c1 |= (c2 >> 6) & 0x03;
    out += ALPHABET[c1 & 0x3f];
    out += ALPHABET[c2 & 0x3f];
  }
  return out;
}

export function decodeBase64(text: string, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let written = 0;
  let i = 0;

  const next = (): number => {
    const index = i < text.length ? ALPHABET.indexOf(text[i]!) : -1;
    if (index < 0) throw new Error('Invalid character in a bcrypt hash.');
    i++;
    return index;
  };

  while (written < length) {
    const c1 = next();
    const c2 = next();
    out[written++] = (c1 << 2) | ((c2 & 0x30) >> 4);
    if (written >= length) break;
    const c3 = next();
    out[written++] = ((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2);
    if (written >= length) break;
    const c4 = next();
    out[written++] = ((c3 & 0x03) << 6) | c4;
  }
  return out;
}

export interface BcryptHash {
  readonly version: BcryptVersion;
  readonly cost: number;
  readonly salt: Uint8Array;
  readonly digest: Uint8Array;
}

/** Format as `$2a$10$<22 salt chars><31 digest chars>`. */
export function formatHash({ version, cost, salt, digest }: BcryptHash): string {
  return `$${version}$${String(cost).padStart(2, '0')}$${encodeBase64(salt, SALT_BYTES)}${encodeBase64(digest, 23)}`;
}

/** Read a stored bcrypt hash back into its parts. Throws on anything malformed. */
export function parseHash(text: string): BcryptHash {
  const match = /^\$(2[aby])\$(\d{2})\$([./A-Za-z0-9]{53})$/.exec(text.trim());
  if (match === null) {
    throw new Error(
      'Not a bcrypt hash. Expected $2a$, $2b$ or $2y$, a two-digit cost, and 53 more characters.',
    );
  }
  const version = match[1] as BcryptVersion;
  const cost = Number(match[2]);
  if (cost < MIN_COST || cost > MAX_COST) {
    throw new Error(`bcrypt cost must be from ${MIN_COST} to ${MAX_COST}; this hash says ${cost}.`);
  }
  return {
    version,
    cost,
    salt: decodeBase64(match[3]!.slice(0, 22), SALT_BYTES),
    digest: decodeBase64(match[3]!.slice(22), 23),
  };
}

export function isBcryptVersion(value: string): value is BcryptVersion {
  return (VERSIONS as ReadonlyArray<string>).includes(value);
}

/** Hash a password and return the full `$2a$...` string. */
export async function bcryptHash(
  password: Uint8Array,
  salt: Uint8Array,
  cost: number,
  version: BcryptVersion = '2a',
  options: BcryptOptions = {},
): Promise<string> {
  const digest = await bcryptRaw(password, salt, cost, options);
  return formatHash({ version, cost, salt, digest });
}

/**
 * Check a password against a stored hash.
 *
 * The comparison is over the digest bytes rather than the strings, and it does
 * not stop at the first difference. Timing is not really the threat when both
 * sides are in the same tab, but a verifier that returns early is a bad
 * pattern to copy out of.
 */
export async function bcryptVerify(
  password: Uint8Array,
  stored: string,
  options: BcryptOptions = {},
): Promise<{ readonly matches: boolean; readonly hash: BcryptHash }> {
  const hash = parseHash(stored);
  const digest = await bcryptRaw(password, hash.salt, hash.cost, options);

  let diff = digest.length ^ hash.digest.length;
  for (let i = 0; i < digest.length; i++) diff |= digest[i]! ^ (hash.digest[i] ?? 0);

  return { matches: diff === 0, hash };
}
