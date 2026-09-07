/**
 * Cryptographically strong random bytes. Never Math.random: a key or an IV
 * drawn from that is not a key or an IV.
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 1) {
    throw new Error(`Need a positive length to draw; got ${length}.`);
  }
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('This environment has no CSPRNG.');
  }
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}
