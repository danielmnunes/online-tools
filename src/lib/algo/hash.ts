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
import { HASHES, type HashId } from './hashes';

export interface StreamingHasher {
  update(data: Uint8Array): unknown;
  digest(): Uint8Array;
}

/**
 * The slice of noble's CHash this codebase actually uses. Declaring it
 * ourselves lets composed algorithms like double-sha256, which no library
 * exports, satisfy the same contract.
 */
export interface HashFn {
  (message: Uint8Array): Uint8Array;
  create(): StreamingHasher;
  readonly outputLen: number;
  readonly blockLen: number;
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

function assertHmacSupported(id: HashId): void {
  if (!HASHES[id].hmac) {
    throw new Error(`${HASHES[id].label} does not support HMAC.`);
  }
}

/** Hash an in-memory byte string, optionally as HMAC with the given key. */
export async function hashBytes(
  id: HashId,
  data: Uint8Array,
  hmacKey?: Uint8Array,
): Promise<Uint8Array> {
  const hash = await LOADERS[id]();
  if (hmacKey === undefined) return hash(data);

  assertHmacSupported(id);
  const { hmac } = await import('@noble/hashes/hmac.js');
  // Safe because every hmac-capable algorithm is a noble CHash; the composed
  // ones that are not are all declared hmac: false above.
  return hmac(hash as unknown as CHash, hmacKey, data);
}

/** Start an incremental hash, for input that does not fit in memory at once. */
export async function createStreamingHasher(
  id: HashId,
  hmacKey?: Uint8Array,
): Promise<StreamingHasher> {
  const hash = await LOADERS[id]();
  if (hmacKey === undefined) return hash.create();

  assertHmacSupported(id);
  const { hmac } = await import('@noble/hashes/hmac.js');
  return hmac.create(hash as unknown as CHash, hmacKey);
}

export interface HashBlobOptions {
  /** Called with a value from 0 to 1 as the file is consumed. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  hmacKey?: Uint8Array;
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
  { onProgress, signal, hmacKey }: HashBlobOptions = {},
): Promise<Uint8Array> {
  function throwIfAborted(): void {
    if (signal?.aborted) throw new DOMException('Hashing cancelled.', 'AbortError');
  }

  throwIfAborted();
  const hasher = await createStreamingHasher(id, hmacKey);
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
