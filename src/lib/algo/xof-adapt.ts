/**
 * The uniform shape every SP 800-185 function is presented in, and the
 * adapters that get each of noble's four different call signatures into it.
 *
 * Deliberately free of crypto imports. Every module in impl/xof/ imports this
 * one, so anything reachable from here would land in all sixteen chunks.
 */

/** Parameters after the metadata table has been consulted and defaults filled in. */
export interface XofRuntimeParams {
  /** Output length in bytes. */
  readonly dkLen: number;
  /** MAC key, for the KMAC family. */
  readonly key?: Uint8Array;
  /** Customization string S. */
  readonly customization?: Uint8Array;
  /** Function-name string N, for cSHAKE only. */
  readonly functionName?: Uint8Array;
  /** Block size B in bytes, for ParallelHash. */
  readonly blockLen?: number;
}

export interface StreamingXof {
  update(data: Uint8Array): unknown;
  digest(): Uint8Array;
}

export interface XofImpl {
  /**
   * One shot. Non-tuple functions are handed a single-element array, which
   * keeps the caller from having to know which is which.
   */
  hash(messages: ReadonlyArray<Uint8Array>, params: XofRuntimeParams): Uint8Array;
  /**
   * Incremental. Absent on the functions whose input is not a byte stream --
   * TupleHash, whose elements are separated, and ParallelHash, whose block
   * size interacts with how input is fed.
   */
  create?(params: XofRuntimeParams): StreamingXof;
}

/** noble's option bag, assembled from the parameters a given function accepts. */
interface NobleOpts {
  dkLen: number;
  personalization?: Uint8Array;
  NISTfn?: Uint8Array;
  blockLen?: number;
}

function opts(p: XofRuntimeParams): NobleOpts {
  const out: NobleOpts = { dkLen: p.dkLen };
  if (p.customization !== undefined) out.personalization = p.customization;
  if (p.functionName !== undefined) out.NISTfn = p.functionName;
  if (p.blockLen !== undefined) out.blockLen = p.blockLen;
  return out;
}

/** The single message the non-tuple functions expect. */
function only(messages: ReadonlyArray<Uint8Array>): Uint8Array {
  return messages[0] ?? new Uint8Array(0);
}

interface NobleXof {
  (message: Uint8Array, o?: NobleOpts): Uint8Array;
  create(o?: NobleOpts): StreamingXof;
}

interface NobleKmac {
  (key: Uint8Array, message: Uint8Array, o?: NobleOpts): Uint8Array;
  create(key: Uint8Array, o?: NobleOpts): StreamingXof;
}

interface NobleTuple {
  (messages: Uint8Array[], o?: NobleOpts): Uint8Array;
}

/** SHAKE, cSHAKE and ParallelHash: one message, options, and a streaming form. */
export function fromMessage(fn: NobleXof, streaming = true): XofImpl {
  const impl: XofImpl = {
    hash: (messages, p) => fn(only(messages), opts(p)),
  };
  if (streaming) impl.create = (p) => fn.create(opts(p));
  return impl;
}

/** KMAC: the key is a positional argument rather than an option. */
export function fromKeyed(fn: NobleKmac): XofImpl {
  return {
    hash: (messages, p) => fn(p.key ?? new Uint8Array(0), only(messages), opts(p)),
    create: (p) => fn.create(p.key ?? new Uint8Array(0), opts(p)),
  };
}

/** TupleHash: the whole tuple goes in at once, and there is no stream to append to. */
export function fromTuple(fn: NobleTuple): XofImpl {
  return {
    hash: (messages, p) => fn([...messages], opts(p)),
  };
}
