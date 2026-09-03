/**
 * Client-side hashing, for both typed text and whole files.
 *
 * Backed by @noble/hashes rather than hash-wasm, for a reason worth recording:
 * hash-wasm ships as a single ESM file with every algorithm's WebAssembly
 * inlined, so a bundler can tree-shake it but cannot split it. One page that
 * hashes MD5 would download the code for every other algorithm too -- about
 * 84 KB gzipped once the full catalogue is in place. @noble/hashes publishes
 * one module per algorithm family, so /md5/ downloads roughly 4 KB and stays
 * at roughly 4 KB no matter how many tools the site grows.
 *
 * The trade-off is throughput on large files, where pure JavaScript is several
 * times slower than WebAssembly. That is a real cost, but it buys a responsive
 * first paint on every page, and the file path below streams rather than
 * buffering, so the practical ceiling is patience rather than memory.
 */
import type { CHash } from '@noble/hashes/utils.js';
import { HASHES, describeRange, type HashId } from './hashes';

export interface StreamingHasher {
  update(data: Uint8Array): unknown;
  digest(): Uint8Array;
}

/**
 * Per-call settings the BLAKE family accepts. Algorithms that take neither
 * simply ignore the argument, which is why the contract below can be uniform.
 */
export interface HashOpts {
  key?: Uint8Array;
  dkLen?: number;
}

/**
 * The slice of noble's CHash this codebase actually uses. Declaring it
 * ourselves lets composed algorithms like double-sha256, which no library
 * exports, satisfy the same contract.
 */
export interface HashFn {
  (message: Uint8Array, opts?: HashOpts): Uint8Array;
  create(opts?: HashOpts): StreamingHasher;
  readonly outputLen: number;
  readonly blockLen: number;
}

/**
 * How an algorithm should be keyed and how long its digest should be.
 *
 * `hmacKey` and `key` are deliberately separate rather than one field: they
 * are different constructions, available on disjoint sets of algorithms, and
 * conflating them would let a caller silently get HMAC-BLAKE2b when it asked
 * for keyed BLAKE2b -- a different value with the same shape.
 */
export interface HashParams {
  /** Key for the HMAC construction, for algorithms declaring `hmac: true`. */
  hmacKey?: Uint8Array;
  /** Key passed to the algorithm itself, for those declaring a `key` range. */
  key?: Uint8Array;
  /** Digest length in bytes, for algorithms declaring a `dkLen` range. */
  dkLen?: number;
}

/**
 * One dynamic import per algorithm so Rollup emits separate chunks.
 * Algorithms sharing a noble module (md5 and sha1 both live in legacy.js)
 * correctly share a chunk; algorithms in different modules do not.
 */
const LOADERS: Readonly<Record<HashId, () => Promise<HashFn>>> = {
  md5: () => import('./impl/md5').then((m) => m.default),
  sha1: () => import('./impl/sha1').then((m) => m.default),
  ripemd160: () => import('./impl/ripemd160').then((m) => m.default),

  sha224: () => import('./impl/sha224').then((m) => m.default),
  sha256: () => import('./impl/sha256').then((m) => m.default),
  'double-sha256': () => import('./impl/double-sha256').then((m) => m.default),
  sha384: () => import('./impl/sha384').then((m) => m.default),
  sha512: () => import('./impl/sha512').then((m) => m.default),
  'sha512-224': () => import('./impl/sha512-224').then((m) => m.default),
  'sha512-256': () => import('./impl/sha512-256').then((m) => m.default),

  'sha3-224': () => import('./impl/sha3-224').then((m) => m.default),
  'sha3-256': () => import('./impl/sha3-256').then((m) => m.default),
  'sha3-384': () => import('./impl/sha3-384').then((m) => m.default),
  'sha3-512': () => import('./impl/sha3-512').then((m) => m.default),

  'keccak-224': () => import('./impl/keccak-224').then((m) => m.default),
  'keccak-256': () => import('./impl/keccak-256').then((m) => m.default),
  'keccak-384': () => import('./impl/keccak-384').then((m) => m.default),
  'keccak-512': () => import('./impl/keccak-512').then((m) => m.default),

  blake2b: () => import('./impl/blake2b').then((m) => m.default),
  blake2s: () => import('./impl/blake2s').then((m) => m.default),
  blake3: () => import('./impl/blake3').then((m) => m.default),
};

/**
 * The loader for one algorithm, for callers outside this module.
 *
 * PBKDF2, HKDF and EvpKDF are all parameterised by a hash, and they want the
 * same lazily-loaded, separately-chunked function this module already knows
 * how to fetch.
 */
export function loadHash(id: HashId): Promise<HashFn> {
  return LOADERS[id]();
}

/**
 * Rejects parameters the algorithm does not accept, rather than letting them
 * be silently dropped. Getting an unkeyed digest back from a call that asked
 * for a keyed one is the kind of failure nobody notices until it matters.
 */
function assertParams(id: HashId, { hmacKey, key, dkLen }: HashParams): void {
  const meta = HASHES[id];

  if (hmacKey !== undefined && !meta.hmac) {
    throw new Error(`${meta.label} does not support HMAC.`);
  }
  if (hmacKey !== undefined && key !== undefined) {
    throw new Error(`${meta.label} takes either an HMAC key or its own key, not both.`);
  }

  if (key !== undefined) {
    if (meta.key === undefined) {
      throw new Error(`${meta.label} does not take a key.`);
    }
    if (key.length < meta.key.min || key.length > meta.key.max) {
      throw new Error(
        `${meta.label} needs a key of ${describeRange(meta.key)} bytes; got ${key.length}.`,
      );
    }
  }

  if (dkLen !== undefined) {
    if (meta.dkLen === undefined) {
      throw new Error(`${meta.label} always produces ${meta.bits / 8} bytes.`);
    }
    if (!Number.isInteger(dkLen) || dkLen < meta.dkLen.min || dkLen > meta.dkLen.max) {
      throw new Error(
        `${meta.label} produces ${describeRange(meta.dkLen)} bytes; got ${dkLen}.`,
      );
    }
  }
}

/** The subset noble understands, or undefined when there is nothing to pass. */
function nobleOpts({ key, dkLen }: HashParams): HashOpts | undefined {
  if (key === undefined && dkLen === undefined) return undefined;
  const opts: HashOpts = {};
  if (key !== undefined) opts.key = key;
  if (dkLen !== undefined) opts.dkLen = dkLen;
  return opts;
}

/** Hash an in-memory byte string, keyed and sized as the parameters ask. */
export async function hashBytes(
  id: HashId,
  data: Uint8Array,
  params: HashParams = {},
): Promise<Uint8Array> {
  assertParams(id, params);
  const hash = await LOADERS[id]();

  if (params.hmacKey !== undefined) {
    const { hmac } = await import('@noble/hashes/hmac.js');
    // Safe because every hmac-capable algorithm is a noble CHash; the composed
    // ones that are not are all declared hmac: false above.
    return hmac(hash as unknown as CHash, params.hmacKey, data);
  }

  return hash(data, nobleOpts(params));
}

/** Start an incremental hash, for input that does not fit in memory at once. */
export async function createStreamingHasher(
  id: HashId,
  params: HashParams = {},
): Promise<StreamingHasher> {
  assertParams(id, params);
  const hash = await LOADERS[id]();

  if (params.hmacKey !== undefined) {
    const { hmac } = await import('@noble/hashes/hmac.js');
    return hmac.create(hash as unknown as CHash, params.hmacKey);
  }

  return hash.create(nobleOpts(params));
}

export interface HashBlobOptions extends HashParams {
  /** Called with a value from 0 to 1 as the file is consumed. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Bytes read per iteration when hashing a file.
 *
 * Large enough that the per-chunk overhead is negligible, small enough that
 * the await between chunks hands control back to the browser often enough to
 * keep the page repainting and the progress bar moving.
 */
const CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Hash a File or Blob by reading it a chunk at a time.
 *
 * Reading through slice() rather than arrayBuffer() is the whole point: a 4 GB
 * file is hashed with one chunk resident at a time instead of the entire file.
 * Slicing explicitly rather than using blob.stream() keeps the chunk size ours,
 * which makes progress granularity and yielding predictable rather than
 * dependent on how a particular browser chooses to feed the stream.
 */
export async function hashBlob(
  id: HashId,
  blob: Blob,
  { onProgress, signal, ...params }: HashBlobOptions = {},
): Promise<Uint8Array> {
  function throwIfAborted(): void {
    if (signal?.aborted) throw new DOMException('Hashing cancelled.', 'AbortError');
  }

  throwIfAborted();
  const hasher = await createStreamingHasher(id, params);
  const total = blob.size;

  for (let offset = 0; offset < total; ) {
    throwIfAborted();
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = await blob.slice(offset, end).arrayBuffer();
    hasher.update(new Uint8Array(chunk));
    offset = end;
    onProgress?.(offset / total);
  }

  // An empty file never enters the loop but is nonetheless finished.
  if (total === 0) onProgress?.(1);

  return hasher.digest();
}
