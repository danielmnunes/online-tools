/**
 * QR code encoding, behind a dynamic import.
 *
 * uqr is a few kilobytes of JavaScript (Nayuki's algorithm). It is loaded
 * only from the `/qr/` page; the scanner has its own module so this one
 * never pulls ZXing in.
 *
 * The SVG is black on white with a four-module quiet zone — the ISO/IEC
 * 18004 default — so a downloaded file scans the same way a printed one
 * does. The widget can recolour a preview; the file it hands over does not.
 */
import { encode, renderSVG, type QrCodeGenerateResult } from 'uqr';

export type QrEcc = 'L' | 'M' | 'Q' | 'H';

export interface QrEncodeResult {
  readonly svg: string;
  readonly version: number;
  readonly size: number;
  readonly ecc: QrEcc;
}

const BORDER = 4;

export function encodeQr(text: string, ecc: QrEcc = 'M'): QrEncodeResult {
  if (text === '') {
    throw new Error('Nothing to encode.');
  }
  const result: QrCodeGenerateResult = encode(text, { ecc, border: BORDER, boostEcc: false });
  const svg = renderSVG(text, {
    ecc,
    border: BORDER,
    boostEcc: false,
    pixelSize: 8,
    blackColor: '#000000',
    whiteColor: '#ffffff',
  });
  return { svg, version: result.version, size: result.size, ecc };
}

export function svgFile(svg: string): Blob {
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
}
