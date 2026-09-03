/**
 * Metadata for the password-hashing and key-derivation functions.
 *
 * As with hashes.ts and xofs.ts, no crypto is imported here: the registry and
 * the Astro pages read this at build time.
 *
 * The `cost` array is what makes one widget serve eight functions. Each entry
 * is a named integer the form renders as a number field and the dispatcher
 * reads back by key, so adding Argon2's three knobs alongside scrypt's three
 * needs no branch in the component.
 */
import { HASHES, HASH_IDS, type HashId } from './hashes';

export type KdfId =
  | 'pbkdf2'
  | 'evpkdf'
  | 'hkdf'
  | 'scrypt'
  | 'bcrypt'
  | 'argon2d'
  | 'argon2i'
  | 'argon2id';

export type KdfParamKey = 'iterations' | 'N' | 'r' | 'p' | 'rounds' | 't' | 'm';

export interface NumRange {
  readonly default: number;
  readonly min: number;
  readonly max: number;
}

export interface KdfParam extends NumRange {
  readonly key: KdfParamKey;
  readonly label: string;
  /** Shown under the field. Says what the number buys, not what it is. */
  readonly hint: string;
}

/**
 * The format an algorithm's output is conventionally written in when it is
 * stored rather than used as a key.
 *
 * 'phc'    -- $argon2id$v=19$m=..,t=..,p=..$salt$hash
 * 'bcrypt' -- $2a$10$<22 chars of salt><31 chars of hash>
 * 'none'   -- there is no standard string, so the tool shows raw bytes
 */
export type EncodedForm = 'phc' | 'bcrypt' | 'none';

export interface KdfMeta {
  readonly id: KdfId;
  readonly label: string;
  /** What the first input is called: a password to stretch, or key material to expand. */
  readonly secretLabel: 'Password' | 'Input key material';
  readonly salt: 'required' | 'optional' | 'fixed-16';
  /** Whether a salt of the right size can be generated for the user. */
  readonly randomSalt: boolean;
  /** Whether the function is parameterised by an underlying hash. */
  readonly hash: false | { readonly default: HashId };
  /** Whether it takes HKDF's context/application info string. */
  readonly info: boolean;
  /**
   * Argon2's two optional inputs: the secret key K (a "pepper", kept out of
   * the database) and the associated data X (context bound into the hash).
   * RFC 9106 defines both, and its test vectors use both.
   */
  readonly extraInputs: boolean;
  readonly cost: ReadonlyArray<KdfParam>;
  /** Output length in bytes, or absent when the function fixes it. */
  readonly dkLen?: NumRange;
  readonly encoded: EncodedForm;
  /**
   * Whether the function is deliberately slow, and so has to run off the UI
   * thread. Argon2 and bcrypt are; PBKDF2 is too at realistic iteration
   * counts. HKDF and EvpKDF are not, by design -- they assume the input is
   * already a good key.
   */
  readonly heavy: boolean;
  /** Whether a `<slug>/verify` page exists for it. */
  readonly verify: boolean;
  readonly keywords: ReadonlyArray<string>;
}

/** Hashes that can drive PBKDF2, HKDF and EvpKDF: every one HMAC accepts. */
export const KDF_HASHES: ReadonlyArray<HashId> = HASH_IDS.filter((id) => HASHES[id].hmac);

const DK_LEN: NumRange = { default: 32, min: 1, max: 1024 };

export const KDFS: Readonly<Record<KdfId, KdfMeta>> = {
  pbkdf2: {
    id: 'pbkdf2',
    label: 'PBKDF2',
    secretLabel: 'Password',
    salt: 'required',
    randomSalt: true,
    hash: { default: 'sha256' },
    info: false,
    extraInputs: false,
    // 600,000 is the OWASP figure for PBKDF2-HMAC-SHA256 as of 2023. It is
    // also roughly a second of pure JavaScript, which is the honest cost of
    // the only defence PBKDF2 has.
    cost: [
      {
        key: 'iterations',
        label: 'Iterations',
        default: 600_000,
        min: 1,
        max: 10_000_000,
        hint: 'Every doubling doubles the attacker’s cost and yours.',
      },
    ],
    dkLen: DK_LEN,
    encoded: 'phc',
    heavy: true,
    verify: true,
    keywords: ['rfc 8018', 'pkcs#5', 'password hashing', 'wpa2', 'django'],
  },

  evpkdf: {
    id: 'evpkdf',
    label: 'EvpKDF',
    secretLabel: 'Password',
    salt: 'optional',
    randomSalt: true,
    hash: { default: 'md5' },
    info: false,
    extraInputs: false,
    cost: [
      {
        key: 'iterations',
        label: 'Iterations',
        default: 1,
        min: 1,
        max: 1_000_000,
        hint: 'OpenSSL uses 1. Raising it does not make this a password hash.',
      },
    ],
    dkLen: DK_LEN,
    encoded: 'none',
    heavy: false,
    verify: false,
    keywords: ['evp_bytestokey', 'openssl enc', 'cryptojs', 'salted__', 'legacy'],
  },

  hkdf: {
    id: 'hkdf',
    label: 'HKDF',
    secretLabel: 'Input key material',
    salt: 'optional',
    randomSalt: true,
    hash: { default: 'sha256' },
    info: true,
    extraInputs: false,
    cost: [],
    dkLen: DK_LEN,
    encoded: 'none',
    heavy: false,
    verify: false,
    keywords: ['rfc 5869', 'extract and expand', 'tls 1.3', 'signal', 'key schedule'],
  },

  scrypt: {
    id: 'scrypt',
    label: 'scrypt',
    secretLabel: 'Password',
    salt: 'required',
    randomSalt: true,
    hash: false,
    info: false,
    extraInputs: false,
    cost: [
      {
        key: 'N',
        label: 'N (cost)',
        default: 16_384,
        min: 2,
        max: 1_048_576,
        hint: 'Must be a power of two. Memory used is roughly 128 · N · r bytes.',
      },
      { key: 'r', label: 'r (block size)', default: 8, min: 1, max: 32, hint: 'RFC 7914 uses 8.' },
      { key: 'p', label: 'p (parallelism)', default: 1, min: 1, max: 16, hint: 'Independent passes; costs time, not memory.' },
    ],
    dkLen: DK_LEN,
    encoded: 'phc',
    heavy: true,
    verify: true,
    keywords: ['rfc 7914', 'memory hard', 'litecoin', 'password hashing'],
  },

  bcrypt: {
    id: 'bcrypt',
    label: 'bcrypt',
    secretLabel: 'Password',
    salt: 'fixed-16',
    randomSalt: true,
    hash: false,
    info: false,
    extraInputs: false,
    cost: [
      {
        key: 'rounds',
        label: 'Cost',
        default: 10,
        min: 4,
        max: 16,
        hint: 'A base-2 logarithm: 10 means 1024 key-schedule rounds.',
      },
    ],
    // bcrypt's output is 23 bytes of a fixed 24-byte ciphertext. It is not a
    // length the caller chooses, which is exactly why it is a password hash
    // and not a KDF.
    encoded: 'bcrypt',
    heavy: true,
    verify: true,
    keywords: ['blowfish', 'openbsd', '$2a$', '$2b$', 'password hashing'],
  },

  argon2d: {
    id: 'argon2d',
    label: 'Argon2d',
    secretLabel: 'Password',
    salt: 'required',
    randomSalt: true,
    hash: false,
    info: false,
    extraInputs: true,
    cost: argonCost(),
    dkLen: { default: 32, min: 4, max: 1024 },
    encoded: 'phc',
    heavy: true,
    verify: false,
    keywords: ['rfc 9106', 'data dependent', 'gpu resistant', 'cryptocurrency'],
  },

  argon2i: {
    id: 'argon2i',
    label: 'Argon2i',
    secretLabel: 'Password',
    salt: 'required',
    randomSalt: true,
    hash: false,
    info: false,
    extraInputs: true,
    cost: argonCost(),
    dkLen: { default: 32, min: 4, max: 1024 },
    encoded: 'phc',
    heavy: true,
    verify: false,
    keywords: ['rfc 9106', 'data independent', 'side channel', 'password hashing'],
  },

  argon2id: {
    id: 'argon2id',
    label: 'Argon2id',
    secretLabel: 'Password',
    salt: 'required',
    randomSalt: true,
    hash: false,
    info: false,
    extraInputs: true,
    cost: argonCost(),
    dkLen: { default: 32, min: 4, max: 1024 },
    encoded: 'phc',
    heavy: true,
    // The verify page reads the variant out of the encoded string, so one
    // page serves all three rather than three near-identical ones.
    verify: true,
    keywords: ['rfc 9106', 'password hashing competition', 'owasp', 'recommended'],
  },
};

/**
 * Argon2's three knobs, shared by the variants.
 *
 * The defaults are OWASP's second configuration for Argon2id: 19 MiB, two
 * passes, one lane. Chosen over RFC 9106's 2 GiB first recommendation because
 * this runs in a browser tab, and a tab that allocates two gigabytes is a tab
 * that gets killed.
 */
function argonCost(): ReadonlyArray<KdfParam> {
  return [
    { key: 't', label: 't (iterations)', default: 2, min: 1, max: 100, hint: 'Passes over memory.' },
    {
      key: 'm',
      label: 'm (memory, KiB)',
      default: 19_456,
      min: 8,
      max: 1_048_576,
      hint: 'The whole point of Argon2: memory an attacker must also buy.',
    },
    { key: 'p', label: 'p (parallelism)', default: 1, min: 1, max: 16, hint: 'Lanes. JavaScript runs them in sequence.' },
  ];
}

export const KDF_IDS = Object.keys(KDFS) as KdfId[];

export function isKdfId(value: string): value is KdfId {
  return Object.hasOwn(KDFS, value);
}

/** Defaults for every cost knob an algorithm declares, keyed for the widget. */
export function defaultCost(id: KdfId): Record<string, number> {
  return Object.fromEntries(KDFS[id].cost.map((param) => [param.key, param.default]));
}

/** Salt length in bytes suggested by the "generate" button. */
export function suggestedSaltLength(id: KdfId): number {
  return KDFS[id].salt === 'fixed-16' ? 16 : 16;
}

/** The Argon2 variants, which share an encoded form and a verify page. */
export const ARGON2_IDS = ['argon2d', 'argon2i', 'argon2id'] as const;

export type Argon2Id = (typeof ARGON2_IDS)[number];

export function isArgon2(id: string): id is Argon2Id {
  return (ARGON2_IDS as ReadonlyArray<string>).includes(id);
}
