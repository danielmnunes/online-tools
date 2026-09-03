/**
 * The SP 800-185 functions, dispatched from the metadata table.
 *
 * The same argument as hash.ts applies to the loader map below: one dynamic
 * import per function so Rollup emits separate chunks. All fourteen SP 800-185
 * functions live in one noble module, so they share a chunk with each other
 * but not with SHAKE, and none of them lands on a page that does not ask.
 *
 * The validation here is the point of the module. These functions have four
 * inputs that look interchangeable and are not -- a key, a customization
 * string, a function name and an output length -- and every one of them
 * changes the answer. Passing a customization string to SHAKE, which has
 * nowhere to put it, has to be an error rather than a silently plain digest.
 */
import { XOFS, describeRange, type XofId } from './xofs';
import type { StreamingXof, XofImpl, XofRuntimeParams } from './xof-adapt';

export type { StreamingXof, XofRuntimeParams };

/** What a caller may ask for, before defaults are applied. */
export interface XofParams {
  /** MAC key, for the KMAC family. */
  key?: Uint8Array;
  /** Customization string S. Empty and absent mean the same thing to the spec. */
  customization?: Uint8Array;
  /** Function-name string N, accepted by cSHAKE only. */
  functionName?: Uint8Array;
  /** Block size B in bytes, for ParallelHash. */
  blockLen?: number;
  /** Output length in bytes. Defaults to the function's natural size. */
  dkLen?: number;
}

const LOADERS: Readonly<Record<XofId, () => Promise<XofImpl>>> = {
  shake128: () => import('./impl/xof/shake128').then((m) => m.default),
  shake256: () => import('./impl/xof/shake256').then((m) => m.default),

  cshake128: () => import('./impl/xof/cshake128').then((m) => m.default),
  cshake256: () => import('./impl/xof/cshake256').then((m) => m.default),

  kmac128: () => import('./impl/xof/kmac128').then((m) => m.default),
  kmac256: () => import('./impl/xof/kmac256').then((m) => m.default),
  kmacxof128: () => import('./impl/xof/kmacxof128').then((m) => m.default),
  kmacxof256: () => import('./impl/xof/kmacxof256').then((m) => m.default),

  tuplehash128: () => import('./impl/xof/tuplehash128').then((m) => m.default),
  tuplehash256: () => import('./impl/xof/tuplehash256').then((m) => m.default),
  tuplehashxof128: () => import('./impl/xof/tuplehashxof128').then((m) => m.default),
  tuplehashxof256: () => import('./impl/xof/tuplehashxof256').then((m) => m.default),

  parallelhash128: () => import('./impl/xof/parallelhash128').then((m) => m.default),
  parallelhash256: () => import('./impl/xof/parallelhash256').then((m) => m.default),
  parallelhashxof128: () => import('./impl/xof/parallelhashxof128').then((m) => m.default),
  parallelhashxof256: () => import('./impl/xof/parallelhashxof256').then((m) => m.default),
};

/**
 * Fills in defaults and rejects anything the function has no slot for.
 *
 * An empty customization string is dropped rather than passed on: SP 800-185
 * defines S = "" as the absent case, and cSHAKE with both N and S empty is
 * plain SHAKE. Forwarding a zero-length array would be harmless but it makes
 * the "cSHAKE with no strings is SHAKE" identity harder to see in the tests.
 */
export function resolveParams(id: XofId, params: XofParams = {}): XofRuntimeParams {
  const meta = XOFS[id];
  const { key, customization, functionName, blockLen, dkLen } = params;

  if (meta.key === 'none' && key !== undefined && key.length > 0) {
    throw new Error(`${meta.label} does not take a key.`);
  }
  if (meta.key === 'required' && key === undefined) {
    throw new Error(`${meta.label} needs a key.`);
  }
  if (!meta.customization && customization !== undefined && customization.length > 0) {
    throw new Error(
      `${meta.label} does not take a customization string. ` +
        `cSHAKE${meta.strength} is the customizable form of the same function.`,
    );
  }
  if (!meta.functionName && functionName !== undefined && functionName.length > 0) {
    throw new Error(
      `${meta.label} fixes its function name in the specification and does not take one.`,
    );
  }
  if (meta.blockLen === undefined && blockLen !== undefined) {
    throw new Error(`${meta.label} does not take a block size.`);
  }

  const length = dkLen ?? meta.defaultLen;
  if (!Number.isInteger(length) || length < meta.dkLen.min || length > meta.dkLen.max) {
    throw new Error(
      `${meta.label} produces ${describeRange(meta.dkLen)} bytes; got ${dkLen}.`,
    );
  }

  const block = blockLen ?? meta.blockLen?.default;
  if (meta.blockLen !== undefined && block !== undefined) {
    if (!Number.isInteger(block) || block < meta.blockLen.min || block > meta.blockLen.max) {
      throw new Error(
        `${meta.label} takes a block size of ${describeRange(meta.blockLen)} bytes; got ${blockLen}.`,
      );
    }
  }

  const resolved: XofRuntimeParams = { dkLen: length };
  return {
    ...resolved,
    ...(key !== undefined ? { key } : {}),
    ...(customization !== undefined && customization.length > 0 ? { customization } : {}),
    ...(functionName !== undefined && functionName.length > 0 ? { functionName } : {}),
    ...(block !== undefined ? { blockLen: block } : {}),
  };
}

/**
 * Run a function over an ordered tuple of inputs.
 *
 * Everything except TupleHash takes exactly one element; handing those a
 * longer tuple is a caller bug rather than something to quietly concatenate,
 * because concatenating is precisely the ambiguity TupleHash exists to avoid.
 */
export async function xofBytes(
  id: XofId,
  messages: ReadonlyArray<Uint8Array>,
  params: XofParams = {},
): Promise<Uint8Array> {
  const meta = XOFS[id];
  if (!meta.tuple && messages.length > 1) {
    throw new Error(`${meta.label} takes one input, not ${messages.length}.`);
  }
  const resolved = resolveParams(id, params);
  const impl = await LOADERS[id]();
  return impl.hash(messages, resolved);
}

/** Start an incremental computation, for input that does not fit in memory. */
export async function createStreamingXof(
  id: XofId,
  params: XofParams = {},
): Promise<StreamingXof> {
  const meta = XOFS[id];
  const resolved = resolveParams(id, params);
  const impl = await LOADERS[id]();
  if (impl.create === undefined) {
    throw new Error(`${meta.label} cannot be computed incrementally.`);
  }
  return impl.create(resolved);
}

export interface XofBlobOptions extends XofParams {
  /** Called with a value from 0 to 1 as the file is consumed. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Matches hash.ts: large enough to amortise, small enough to keep the page painting. */
const CHUNK_SIZE = 4 * 1024 * 1024;

/** Run a function over a File or Blob, a chunk at a time. */
export async function xofBlob(
  id: XofId,
  blob: Blob,
  { onProgress, signal, ...params }: XofBlobOptions = {},
): Promise<Uint8Array> {
  function throwIfAborted(): void {
    if (signal?.aborted) throw new DOMException('Hashing cancelled.', 'AbortError');
  }

  throwIfAborted();
  const hasher = await createStreamingXof(id, params);
  const total = blob.size;

  for (let offset = 0; offset < total; ) {
    throwIfAborted();
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = await blob.slice(offset, end).arrayBuffer();
    hasher.update(new Uint8Array(chunk));
    offset = end;
    onProgress?.(offset / total);
  }

  if (total === 0) onProgress?.(1);

  return hasher.digest();
}
