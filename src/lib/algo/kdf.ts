/**
 * Key derivation and password hashing, dispatched from the metadata table.
 *
 * Two jobs share this module because they share almost all their inputs and
 * none of their purpose. HKDF and EvpKDF turn key material into more key
 * material and are meant to be fast. PBKDF2, scrypt, bcrypt and Argon2 turn a
 * password into key material and are meant to be slow -- the cost parameters
 * are the security. Mixing them up is the single most common mistake in this
 * area, so the metadata marks which is which and the pages say so out loud.
 *
 * Everything here is async and takes a signal, because at realistic parameters
 * these run for seconds. The heavy ones are additionally meant to be called
 * from a worker; see lib/worker/pool.ts.
 */
import type { CHash } from '@noble/hashes/utils.js';
import { loadHash } from './hash';
import type { HashId } from './hashes';
import { KDFS, isArgon2, type KdfId } from './kdfs';
import {
  formatArgon2,
  formatDjango,
  formatScrypt,
  looksEncoded,
  parseEncoded,
  type EncodedHash,
} from '../phc';
import { bcryptHash, bcryptVerify, parseHash as parseBcrypt, SALT_BYTES } from './legacy/bcrypt';
import { bytesFromAnyEncoding } from '../encoding';

/** Everything a derivation can be given. Unused fields are ignored per algorithm. */
export interface KdfInputs {
  readonly password: Uint8Array;
  readonly salt: Uint8Array;
  /** HKDF's context and application-specific information. */
  readonly info?: Uint8Array;
  /** Argon2's optional secret key K, sometimes called a pepper. */
  readonly secret?: Uint8Array;
  /** Argon2's optional associated data X. */
  readonly associatedData?: Uint8Array;
  /** The underlying hash, for the algorithms parameterised by one. */
  readonly hash?: HashId;
  /** Cost knobs, keyed as the metadata table names them. */
  readonly cost: Readonly<Record<string, number>>;
  /** Output length in bytes. Ignored by bcrypt, which fixes its own. */
  readonly dkLen: number;
}

export interface KdfOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface KdfResult {
  /** The raw derived bytes. */
  readonly key: Uint8Array;
  /** The conventional storage form, where the algorithm has one. */
  readonly encoded?: string;
}

/**
 * How long the derivation may block before handing control back.
 *
 * noble's async variants yield on this interval. 20 ms keeps a progress bar
 * moving and a cancel button clickable without the yields themselves costing
 * a measurable fraction of the work.
 */
const ASYNC_TICK = 20;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Derivation cancelled.', 'AbortError');
}

/** The underlying hash as noble's KDFs want it. */
async function chash(id: HashId): Promise<CHash> {
  return (await loadHash(id)) as unknown as CHash;
}

function cost(inputs: KdfInputs, key: string): number {
  const value = inputs.cost[key];
  if (value === undefined) throw new Error(`Missing the "${key}" parameter.`);
  return value;
}

/**
 * Derive a key, and where the algorithm has a conventional storage string,
 * produce that too.
 *
 * The encoded form is built here rather than in the widget because it has to
 * agree exactly with what the verify path parses, and keeping the two next to
 * each other is the only way that stays true.
 */
export async function deriveKey(
  id: KdfId,
  inputs: KdfInputs,
  { onProgress, signal }: KdfOptions = {},
): Promise<KdfResult> {
  const meta = KDFS[id];
  throwIfAborted(signal);

  if (meta.salt === 'required' && inputs.salt.length === 0) {
    throw new Error(`${meta.label} needs a salt.`);
  }

  if (id === 'bcrypt') {
    if (inputs.salt.length !== SALT_BYTES) {
      throw new Error(`bcrypt needs a ${SALT_BYTES}-byte salt; got ${inputs.salt.length}.`);
    }
    const encoded = await bcryptHash(
      inputs.password,
      inputs.salt,
      cost(inputs, 'rounds'),
      '2a',
      { onProgress, signal },
    );
    return { key: parseBcrypt(encoded).digest, encoded };
  }

  if (isArgon2(id)) {
    const { ARGON2 } = await import('./impl/kdf/argon2');
    const key = await ARGON2[id](inputs.password, inputs.salt, {
      t: cost(inputs, 't'),
      m: cost(inputs, 'm'),
      p: cost(inputs, 'p'),
      dkLen: inputs.dkLen,
      asyncTick: ASYNC_TICK,
      onProgress,
      ...(inputs.secret !== undefined && inputs.secret.length > 0 ? { key: inputs.secret } : {}),
      // noble spells Argon2's associated data "personalization".
      ...(inputs.associatedData !== undefined && inputs.associatedData.length > 0
        ? { personalization: inputs.associatedData }
        : {}),
    });
    throwIfAborted(signal);
    return {
      key,
      encoded: formatArgon2(id, inputs.cost, inputs.salt, key),
    };
  }

  if (id === 'scrypt') {
    // scrypt insists on a power of two, and noble's message says so in terms
    // of exponents. Saying it in terms of the number they typed is kinder.
    const n = cost(inputs, 'N');
    if (!Number.isInteger(Math.log2(n))) {
      throw new Error(`scrypt needs N to be a power of two; ${n} is not. Try ${2 ** Math.round(Math.log2(n))}.`);
    }
    const { scryptAsync } = await import('./impl/kdf/scrypt');
    const key = await scryptAsync(inputs.password, inputs.salt, {
      N: cost(inputs, 'N'),
      r: cost(inputs, 'r'),
      p: cost(inputs, 'p'),
      dkLen: inputs.dkLen,
      asyncTick: ASYNC_TICK,
      onProgress,
    });
    throwIfAborted(signal);
    return { key, encoded: formatScrypt(inputs.cost, inputs.salt, key) };
  }

  if (id === 'pbkdf2') {
    const { pbkdf2Async } = await import('./impl/kdf/pbkdf2');
    const hash = inputs.hash ?? 'sha256';
    const key = await pbkdf2Async(await chash(hash), inputs.password, inputs.salt, {
      c: cost(inputs, 'iterations'),
      dkLen: inputs.dkLen,
      asyncTick: ASYNC_TICK,
    });
    throwIfAborted(signal);
    onProgress?.(1);
    return {
      key,
      encoded: formatDjango(hash, cost(inputs, 'iterations'), inputs.salt, key),
    };
  }

  if (id === 'hkdf') {
    const { hkdf } = await import('./impl/kdf/hkdf');
    const key = hkdf(
      await chash(inputs.hash ?? 'sha256'),
      inputs.password,
      inputs.salt.length > 0 ? inputs.salt : undefined,
      inputs.info,
      inputs.dkLen,
    );
    onProgress?.(1);
    return { key };
  }

  const { evpKdf } = await import('./impl/kdf/evpkdf');
  const key = evpKdf(
    await chash(inputs.hash ?? 'md5'),
    inputs.password,
    inputs.salt,
    cost(inputs, 'iterations'),
    inputs.dkLen,
  );
  onProgress?.(1);
  return { key };
}

export interface VerifyResult {
  readonly matches: boolean;
  /**
   * Where the parameters came from: an encoded hash carries its own, so the
   * form's are ignored and the UI should say which were used.
   */
  readonly source: 'encoded' | 'raw';
  /** A short description of the parameters the check actually ran with. */
  readonly parameters: string;
  /** The digest that was computed, for display next to the expected one. */
  readonly computed: Uint8Array;
}

/** Constant-ish time comparison. The threat here is habit, not timing. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ (b[i] ?? 0);
  return diff === 0;
}

function describe(encoded: EncodedHash): string {
  const parts = Object.entries(encoded.cost).map(([key, value]) => `${key}=${value}`);
  if (encoded.hash !== undefined) parts.unshift(encoded.hash);
  return parts.join(', ');
}

function describeInputs(id: KdfId, inputs: KdfInputs): string {
  const parts = KDFS[id].cost.map((param) => `${param.key}=${inputs.cost[param.key]}`);
  if (inputs.hash !== undefined && KDFS[id].hash !== false) parts.unshift(inputs.hash);
  return parts.join(', ');
}

/**
 * Check a password against something the user pasted.
 *
 * Two shapes are accepted, because both are things people have to hand: a
 * self-describing hash string, whose parameters override the form entirely,
 * and a bare derived key in hex or base64, which is checked against the form's
 * parameters. Which one happened is reported back, because a verify that
 * quietly used the wrong iteration count and said "no match" would be worse
 * than useless.
 */
export async function verifyKdf(
  id: KdfId,
  expected: string,
  inputs: KdfInputs,
  options: KdfOptions = {},
): Promise<VerifyResult> {
  const trimmed = expected.trim();
  if (trimmed === '') throw new Error('Paste the hash or derived key to check against.');

  if (id === 'bcrypt') {
    const { matches, hash } = await bcryptVerify(inputs.password, trimmed, options);
    return {
      matches,
      source: 'encoded',
      parameters: `${hash.version}, cost=${hash.cost}`,
      computed: hash.digest,
    };
  }

  if (looksEncoded(trimmed)) {
    const parsed = parseEncoded(trimmed);
    const algorithm = isArgon2(id) ? parsed.algorithm : id;
    if (parsed.algorithm !== algorithm) {
      throw new Error(
        `That is a ${KDFS[parsed.algorithm].label} hash. Open the ${KDFS[parsed.algorithm].label} page to check it.`,
      );
    }
    const { key } = await deriveKey(
      algorithm,
      {
        ...inputs,
        salt: parsed.salt,
        cost: parsed.cost,
        dkLen: parsed.digest.length,
        ...(parsed.hash !== undefined ? { hash: parsed.hash } : {}),
      },
      options,
    );
    return {
      matches: equalBytes(key, parsed.digest),
      source: 'encoded',
      parameters: describe(parsed),
      computed: key,
    };
  }

  // A bare digest: hex or base64, checked against whatever the form says.
  const wanted = bytesFromAnyEncoding(trimmed);
  const { key } = await deriveKey(id, { ...inputs, dkLen: wanted.length }, options);
  return {
    matches: equalBytes(key, wanted),
    source: 'raw',
    parameters: describeInputs(id, inputs),
    computed: key,
  };
}
