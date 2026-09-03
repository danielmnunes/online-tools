/**
 * The strings password hashes are stored as.
 *
 * A derived key on its own is not enough to check a password later: you also
 * need the salt and every cost parameter. The conventional answer is to pack
 * all of it into one self-describing string, and there are two conventions
 * worth supporting.
 *
 * The PHC string format, which came out of the Password Hashing Competition,
 * is what Argon2 and modern scrypt use:
 *
 *     $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
 *     $scrypt$ln=14,r=8,p=1$<salt>$<hash>
 *
 * Django uses its own, older shape, which is worth reading because a great
 * many PBKDF2 hashes in the wild are in it:
 *
 *     pbkdf2_sha256$600000$<salt as text>$<hash>
 *
 * Both use base64, but PHC drops the padding and Django keeps it, which is
 * exactly the kind of detail that makes hand-parsing these go wrong.
 */
import { HASHES, isHashId, type HashId } from './algo/hashes';
import { DecodeError, base64ToBytes, bytesToBase64 } from './encoding';
import { isArgon2, type Argon2Id, type KdfId } from './algo/kdfs';

export type EncodedKind = 'argon2' | 'scrypt' | 'django-pbkdf2';

export interface EncodedHash {
  readonly kind: EncodedKind;
  /** Which of the site's algorithms computes this string. */
  readonly algorithm: KdfId;
  /** The underlying hash, for the formats that name one. */
  readonly hash?: HashId;
  /** Cost parameters, under the names the algorithm's table uses. */
  readonly cost: Readonly<Record<string, number>>;
  readonly salt: Uint8Array;
  readonly digest: Uint8Array;
  /** Argon2's version field. 0x13 (19) is current; 0x10 (16) is the 2015 one. */
  readonly version?: number;
}

/** PHC base64: the standard alphabet, no padding. */
export function b64NoPad(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/=+$/, '');
}

function b64Decode(text: string, what: string): Uint8Array {
  const padded = text + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    return base64ToBytes(padded);
  } catch {
    throw new DecodeError(`The ${what} in this hash is not valid base64.`);
  }
}

function parseInteger(value: string, name: string): number {
  if (!/^\d+$/.test(value)) throw new DecodeError(`"${name}" must be a whole number.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new DecodeError(`"${name}" is out of range.`);
  return parsed;
}

/** `m=19456,t=2,p=1` into an object, rejecting anything that is not that shape. */
function parseParams(field: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (field === '') return out;
  for (const pair of field.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new DecodeError(`"${pair}" is not a name=value parameter.`);
    out[pair.slice(0, eq)] = parseInteger(pair.slice(eq + 1), pair.slice(0, eq));
  }
  return out;
}

function requireParams(params: Record<string, number>, keys: string[], format: string): void {
  const missing = keys.filter((key) => !(key in params));
  if (missing.length > 0) {
    throw new DecodeError(`A ${format} hash needs ${missing.join(', ')}.`);
  }
}

function parseArgon2(algorithm: Argon2Id, fields: string[]): EncodedHash {
  // $argon2id$v=19$m=..,t=..,p=..$salt$hash, with v optional (absent means 0x10).
  const hasVersion = fields[2]?.startsWith('v=') ?? false;
  const version = hasVersion ? parseInteger(fields[2]!.slice(2), 'v') : 0x10;
  const rest = hasVersion ? fields.slice(3) : fields.slice(2);

  if (rest.length !== 3) {
    throw new DecodeError('An Argon2 hash needs parameters, a salt and a digest.');
  }
  const cost = parseParams(rest[0]!);
  requireParams(cost, ['m', 't', 'p'], 'Argon2');

  return {
    kind: 'argon2',
    algorithm,
    cost,
    version,
    salt: b64Decode(rest[1]!, 'salt'),
    digest: b64Decode(rest[2]!, 'digest'),
  };
}

function parseScrypt(fields: string[]): EncodedHash {
  if (fields.length !== 5) {
    throw new DecodeError('An scrypt hash needs parameters, a salt and a digest.');
  }
  const params = parseParams(fields[2]!);
  requireParams(params, ['ln', 'r', 'p'], 'scrypt');

  // The PHC form stores log2(N) rather than N, so that N is a power of two by
  // construction rather than by hoping the writer got it right.
  const ln = params['ln']!;
  if (ln < 1 || ln > 30) throw new DecodeError(`"ln" must be from 1 to 30; got ${ln}.`);

  return {
    kind: 'scrypt',
    algorithm: 'scrypt',
    cost: { N: 2 ** ln, r: params['r']!, p: params['p']! },
    salt: b64Decode(fields[3]!, 'salt'),
    digest: b64Decode(fields[4]!, 'digest'),
  };
}

/** `pbkdf2_sha256$600000$saltastext$base64hash`, as Django writes it. */
function parseDjango(text: string): EncodedHash {
  const fields = text.split('$');
  if (fields.length !== 4) {
    throw new DecodeError('A Django PBKDF2 hash has four fields separated by "$".');
  }
  const name = fields[0]!.slice('pbkdf2_'.length);
  // Django spells SHA-1 "sha1" and the rest "sha256", "sha512".
  if (!isHashId(name) || !HASHES[name].hmac) {
    throw new DecodeError(`"${name}" is not a hash this tool can use with PBKDF2.`);
  }

  return {
    kind: 'django-pbkdf2',
    algorithm: 'pbkdf2',
    hash: name,
    cost: { iterations: parseInteger(fields[1]!, 'iterations') },
    // Django's salt is stored as text, not base64: it is generated from an
    // alphanumeric alphabet precisely so it survives this format.
    salt: new TextEncoder().encode(fields[2]!),
    digest: b64Decode(fields[3]!, 'digest'),
  };
}

/**
 * Read any of the supported encoded forms.
 *
 * Throws a DecodeError describing what was wrong rather than returning
 * undefined: the caller is always a user who pasted something, and "not a
 * recognised hash" is less use than "an Argon2 hash needs m, t, p".
 */
export function parseEncoded(input: string): EncodedHash {
  const text = input.trim();

  if (text.startsWith('pbkdf2_')) return parseDjango(text);

  if (!text.startsWith('$')) {
    throw new DecodeError(
      'Expected a hash starting with "$argon2id$", "$scrypt$", "$2a$" or "pbkdf2_sha256$".',
    );
  }

  const fields = text.split('$');
  const id = fields[1];
  if (id !== undefined && isArgon2(id)) return parseArgon2(id, fields);
  if (id === 'scrypt') return parseScrypt(fields);

  throw new DecodeError(`"$${id ?? ''}$" is not a format this tool reads.`);
}

/** Whether a string looks like an encoded hash rather than a bare digest. */
export function looksEncoded(input: string): boolean {
  const text = input.trim();
  return text.startsWith('$') || text.startsWith('pbkdf2_');
}

export function formatArgon2(
  algorithm: KdfId,
  cost: Readonly<Record<string, number>>,
  salt: Uint8Array,
  digest: Uint8Array,
  version = 0x13,
): string {
  const params = `m=${cost['m']},t=${cost['t']},p=${cost['p']}`;
  return `$${algorithm}$v=${version}$${params}$${b64NoPad(salt)}$${b64NoPad(digest)}`;
}

/**
 * The scrypt PHC string, or undefined when N is not a power of two.
 *
 * scrypt itself insists N be a power of two, but the tool lets a user type
 * whatever they like and reports the error from the algorithm; until then
 * there is simply no `ln` to write down.
 */
export function formatScrypt(
  cost: Readonly<Record<string, number>>,
  salt: Uint8Array,
  digest: Uint8Array,
): string | undefined {
  const n = cost['N'] ?? 0;
  const ln = Math.log2(n);
  if (!Number.isInteger(ln)) return undefined;
  return `$scrypt$ln=${ln},r=${cost['r']},p=${cost['p']}$${b64NoPad(salt)}$${b64NoPad(digest)}`;
}

/** Django keeps the base64 padding and stores the salt as text. */
export function formatDjango(
  hash: HashId,
  iterations: number,
  salt: Uint8Array,
  digest: Uint8Array,
): string | undefined {
  const text = new TextDecoder('utf-8', { fatal: true });
  let saltText: string;
  try {
    saltText = text.decode(salt);
  } catch {
    return undefined;
  }
  // A salt containing "$" would make the string ambiguous, and Django never
  // generates one, so there is nothing to write rather than something wrong.
  if (saltText.includes('$')) return undefined;
  return `pbkdf2_${hash}$${iterations}$${saltText}$${bytesToBase64(digest)}`;
}
