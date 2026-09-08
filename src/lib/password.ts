/**
 * Passwords from crypto.getRandomValues, never Math.random.
 *
 * Mapping a random byte onto an alphabet with `% alphabet.length` is biased
 * whenever the alphabet does not divide 256. The draw here is rejection
 * sampling: bytes at or above the largest multiple of the alphabet size
 * are thrown away, so every character is equally likely.
 *
 * When "require each class" is on, one character is taken from each selected
 * set and the rest from the pooled alphabet, then the result is shuffled
 * with Fisher–Yates — also from crypto.getRandomValues — so the guaranteed
 * characters are not sitting in a predictable position.
 */

export const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
} as const;

export type CharsetId = keyof typeof CHARSETS;

/** Characters that are easy to mix up in a font: zero/O, one/l/I. */
export const AMBIGUOUS = '0OIl1';

export const MIN_LENGTH = 4;
export const MAX_LENGTH = 128;
export const DEFAULT_LENGTH = 20;

export class PasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordError';
  }
}

export interface PasswordOptions {
  readonly length: number;
  readonly sets: ReadonlyArray<CharsetId>;
  readonly excludeAmbiguous?: boolean;
  /** At least one character from each selected set. Default true. */
  readonly requireEverySet?: boolean;
}

/**
 * An unbiased integer in `[0, max)`.
 *
 * `max` itself is excluded. Uses 32-bit draws so alphabets larger than 256
 * (they are not, today) would still be uniform.
 */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 0x1_0000_0000) {
    throw new PasswordError('randomInt max is a positive integer fitting in 32 bits.');
  }
  const range = 0x1_0000_0000;
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const value = buf[0]!;
    if (value < limit) return value % max;
  }
}

function stripAmbiguous(alphabet: string): string {
  let out = '';
  for (const ch of alphabet) {
    if (!AMBIGUOUS.includes(ch)) out += ch;
  }
  return out;
}

export function alphabetFor(options: PasswordOptions): string {
  if (options.sets.length === 0) {
    throw new PasswordError('Select at least one character set.');
  }
  const seen = new Set<CharsetId>();
  let pooled = '';
  for (const id of options.sets) {
    if (seen.has(id)) continue;
    seen.add(id);
    pooled += CHARSETS[id];
  }
  if (options.excludeAmbiguous) pooled = stripAmbiguous(pooled);
  if (pooled.length === 0) {
    throw new PasswordError('That combination of options leaves an empty alphabet.');
  }
  return pooled;
}

export function entropyBits(length: number, alphabetSize: number): number {
  if (length <= 0 || alphabetSize <= 1) return 0;
  return length * Math.log2(alphabetSize);
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]!;
}

function shuffle(chars: string[]): string {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = tmp;
  }
  return chars.join('');
}

export function generatePassword(options: PasswordOptions): string {
  const length = options.length;
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new PasswordError(`Length must be an integer between ${MIN_LENGTH} and ${MAX_LENGTH}.`);
  }

  const requireEvery = options.requireEverySet !== false;
  const uniqueSets = [...new Set(options.sets)];
  if (requireEvery && uniqueSets.length > length) {
    throw new PasswordError('Password is shorter than the number of required character sets.');
  }

  const pooled = alphabetFor(options);
  const chars: string[] = [];

  if (requireEvery) {
    for (const id of uniqueSets) {
      let set: string = CHARSETS[id];
      if (options.excludeAmbiguous) set = stripAmbiguous(set);
      if (set.length === 0) {
        throw new PasswordError(`The ${id} set is empty after excluding ambiguous characters.`);
      }
      chars.push(pick(set));
    }
  }

  while (chars.length < length) chars.push(pick(pooled));
  return shuffle(chars);
}
