/**
 * Metadata for the extendable-output and Keccak-MAC functions of
 * NIST SP 800-185, plus the two SHAKEs they are built on (FIPS 202).
 *
 * Like hashes.ts, this module imports no crypto: it is read at build time by
 * the registry and by Astro pages, and must not drag implementations into the
 * server bundle.
 *
 * The shape of the table is the shape of the widget. Each flag below turns a
 * control on, so a page renders exactly the inputs its function accepts and
 * nothing else -- there is no per-algorithm branch in the component.
 */

export type XofId =
  | 'shake128'
  | 'shake256'
  | 'cshake128'
  | 'cshake256'
  | 'kmac128'
  | 'kmac256'
  | 'kmacxof128'
  | 'kmacxof256'
  | 'tuplehash128'
  | 'tuplehash256'
  | 'tuplehashxof128'
  | 'tuplehashxof256'
  | 'parallelhash128'
  | 'parallelhash256'
  | 'parallelhashxof128'
  | 'parallelhashxof256';

export type XofFamily = 'shake' | 'cshake' | 'kmac' | 'tuplehash' | 'parallelhash';

/** An inclusive size range in bytes. */
export interface ByteRange {
  readonly min: number;
  readonly max: number;
}

export interface XofMeta {
  readonly id: XofId;
  /** Display name, spelled as SP 800-185 spells it. */
  readonly label: string;
  readonly family: XofFamily;
  /** Security strength in bits: 128 or 256. */
  readonly strength: 128 | 256;
  /** Output length in bytes when the user does not ask for another. */
  readonly defaultLen: number;
  /** Accepted output lengths in bytes. The ceiling is a UI guard, not a limit of the function. */
  readonly dkLen: ByteRange;
  /** Whether the function takes a key, and whether it insists on one. */
  readonly key: 'none' | 'required';
  /** Whether it accepts a customization string S. */
  readonly customization: boolean;
  /**
   * Whether it accepts a function-name string N. SP 800-185 reserves N for
   * NIST-defined functions, so only cSHAKE -- which is the raw primitive --
   * exposes it; in every other function N is fixed by the specification.
   */
  readonly functionName: boolean;
  /** Whether the input is an ordered tuple of strings rather than one string. */
  readonly tuple: boolean;
  /** Block size B in bytes, for ParallelHash. */
  readonly blockLen?: { readonly default: number } & ByteRange;
  /**
   * True when the output length is squeezed rather than committed to.
   *
   * This is the whole difference between KMAC128 and KMACXOF128, and it is
   * easy to miss: the non-XOF forms encode the requested length into the
   * input, so asking for 32 bytes and asking for 64 give two unrelated
   * values. The XOF forms encode zero, so a short output is the prefix of a
   * long one. Same key, same message, different answer.
   */
  readonly squeezes: boolean;
  /** Extra search terms beyond the label and id. */
  readonly keywords: ReadonlyArray<string>;
}

/** Output length in bytes that each strength defaults to, per the NIST samples. */
const DEFAULT_LEN = { 128: 32, 256: 64 } as const;

/**
 * A megabyte of output is far past any real use and still instant to produce;
 * the cap exists so a typo in the length box cannot hang the tab.
 */
const MAX_LEN = 1_000_000;

interface Variant {
  readonly family: XofFamily;
  readonly strength: 128 | 256;
  readonly squeezes: boolean;
}

function meta(id: XofId, label: string, v: Variant, extra: Partial<XofMeta> = {}): XofMeta {
  return {
    id,
    label,
    family: v.family,
    strength: v.strength,
    defaultLen: DEFAULT_LEN[v.strength],
    dkLen: { min: 1, max: MAX_LEN },
    key: 'none',
    customization: true,
    functionName: false,
    tuple: false,
    squeezes: v.squeezes,
    keywords: [],
    ...extra,
  };
}

export const XOFS: Readonly<Record<XofId, XofMeta>> = {
  // SHAKE takes neither a key nor a customization string: it is the bare
  // sponge, and everything below is SHAKE with framing bolted on.
  shake128: meta('shake128', 'SHAKE128', { family: 'shake', strength: 128, squeezes: true }, {
    customization: false,
    keywords: ['fips 202', 'xof', 'extendable output', 'sha3'],
  }),
  shake256: meta('shake256', 'SHAKE256', { family: 'shake', strength: 256, squeezes: true }, {
    customization: false,
    keywords: ['fips 202', 'xof', 'extendable output', 'sha3'],
  }),

  cshake128: meta('cshake128', 'cSHAKE128', { family: 'cshake', strength: 128, squeezes: true }, {
    functionName: true,
    keywords: ['sp 800-185', 'customizable', 'domain separation', 'personalization'],
  }),
  cshake256: meta('cshake256', 'cSHAKE256', { family: 'cshake', strength: 256, squeezes: true }, {
    functionName: true,
    keywords: ['sp 800-185', 'customizable', 'domain separation', 'personalization'],
  }),

  kmac128: meta('kmac128', 'KMAC128', { family: 'kmac', strength: 128, squeezes: false }, {
    key: 'required',
    keywords: ['sp 800-185', 'keccak mac', 'message authentication', 'mac'],
  }),
  kmac256: meta('kmac256', 'KMAC256', { family: 'kmac', strength: 256, squeezes: false }, {
    key: 'required',
    keywords: ['sp 800-185', 'keccak mac', 'message authentication', 'mac'],
  }),
  kmacxof128: meta('kmacxof128', 'KMACXOF128', { family: 'kmac', strength: 128, squeezes: true }, {
    key: 'required',
    keywords: ['sp 800-185', 'keccak mac', 'xof', 'mac'],
  }),
  kmacxof256: meta('kmacxof256', 'KMACXOF256', { family: 'kmac', strength: 256, squeezes: true }, {
    key: 'required',
    keywords: ['sp 800-185', 'keccak mac', 'xof', 'mac'],
  }),

  tuplehash128: meta('tuplehash128', 'TupleHash128', { family: 'tuplehash', strength: 128, squeezes: false }, {
    tuple: true,
    keywords: ['sp 800-185', 'unambiguous', 'tuple', 'concatenation'],
  }),
  tuplehash256: meta('tuplehash256', 'TupleHash256', { family: 'tuplehash', strength: 256, squeezes: false }, {
    tuple: true,
    keywords: ['sp 800-185', 'unambiguous', 'tuple', 'concatenation'],
  }),
  tuplehashxof128: meta('tuplehashxof128', 'TupleHashXOF128', { family: 'tuplehash', strength: 128, squeezes: true }, {
    tuple: true,
    keywords: ['sp 800-185', 'unambiguous', 'tuple', 'xof'],
  }),
  tuplehashxof256: meta('tuplehashxof256', 'TupleHashXOF256', { family: 'tuplehash', strength: 256, squeezes: true }, {
    tuple: true,
    keywords: ['sp 800-185', 'unambiguous', 'tuple', 'xof'],
  }),

  // B is in bytes and is part of the digest, not a performance knob: the same
  // message under B = 8 and B = 16 hashes to different values.
  parallelhash128: meta('parallelhash128', 'ParallelHash128', { family: 'parallelhash', strength: 128, squeezes: false }, {
    blockLen: { default: 8, min: 1, max: 16_777_216 },
    keywords: ['sp 800-185', 'parallel', 'tree', 'block size'],
  }),
  parallelhash256: meta('parallelhash256', 'ParallelHash256', { family: 'parallelhash', strength: 256, squeezes: false }, {
    blockLen: { default: 8, min: 1, max: 16_777_216 },
    keywords: ['sp 800-185', 'parallel', 'tree', 'block size'],
  }),
  parallelhashxof128: meta('parallelhashxof128', 'ParallelHashXOF128', { family: 'parallelhash', strength: 128, squeezes: true }, {
    blockLen: { default: 8, min: 1, max: 16_777_216 },
    keywords: ['sp 800-185', 'parallel', 'tree', 'xof'],
  }),
  parallelhashxof256: meta('parallelhashxof256', 'ParallelHashXOF256', { family: 'parallelhash', strength: 256, squeezes: true }, {
    blockLen: { default: 8, min: 1, max: 16_777_216 },
    keywords: ['sp 800-185', 'parallel', 'tree', 'xof'],
  }),
};

export const XOF_IDS = Object.keys(XOFS) as XofId[];

/**
 * The functions that also get a file page.
 *
 * TupleHash is left out because a file is one string, not a tuple, so the
 * page would have nothing to offer over SHAKE; ParallelHash is left out
 * because in JavaScript it is not actually parallel, so a file page would
 * promise throughput it cannot deliver.
 */
export const XOF_FILE_IDS: ReadonlyArray<XofId> = [
  'shake128',
  'shake256',
  'cshake128',
  'cshake256',
  'kmac128',
  'kmac256',
];

export function isXofId(value: string): value is XofId {
  return Object.hasOwn(XOFS, value);
}

/** Human-readable form of a size range, for error messages and hints. */
export function describeRange({ min, max }: ByteRange): string {
  return min === max ? `exactly ${min}` : `${min} to ${max}`;
}

/** Other functions in the same family, for "related tools". */
export function familySiblings(id: XofId): XofMeta[] {
  const family = XOFS[id].family;
  return XOF_IDS.filter((other) => other !== id && XOFS[other].family === family).map(
    (other) => XOFS[other],
  );
}
