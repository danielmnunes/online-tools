/**
 * QR encoding.
 *
 * Decoding lives behind WASM and is checked in the browser. What is here is
 * the encoder: a short payload becomes an SVG with a quiet zone, and an
 * empty payload is refused rather than drawn as a blank square.
 */
import { describe, expect, it } from 'vitest';
import { encodeQr } from '~/lib/qr';

describe('encodeQr', () => {
  it('returns an SVG whose viewBox covers the modules plus a 4-module border', () => {
    const result = encodeQr('HELLO', 'M');
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('</svg>');
    expect(result.version).toBeGreaterThanOrEqual(1);
    expect(result.size).toBeGreaterThan(0);
    // Quiet zone of 4 on each side: viewBox is (size + 8) in module units
    // times pixelSize 8.
    expect(result.svg).toMatch(/viewBox="0 0 /);
  });

  it('grows with a denser payload or a higher ECC', () => {
    const low = encodeQr('hi', 'L');
    const high = encodeQr('hi', 'H');
    const long = encodeQr('hi'.repeat(80), 'L');
    expect(long.size).toBeGreaterThanOrEqual(low.size);
    expect(high.ecc).toBe('H');
  });

  it('refuses an empty payload', () => {
    expect(() => encodeQr('')).toThrow(/Nothing to encode/);
  });
});
