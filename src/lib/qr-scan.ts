/**
 * QR code decoding, behind a dynamic import.
 *
 * zxing-wasm's default `locateFile` loads the WASM binary from jsDelivr.
 * That is a request to a host we do not control, which this site does not
 * make. The reader binary is imported as a same-origin hashed URL and
 * handed to Emscripten as `wasmBinary`, so `/qr/scan/` talks to this origin
 * and nowhere else.
 *
 * The writer build is not used: encoding is uqr, which is JavaScript and
 * fits the page budget. The reader WASM is ~1.1 MB uncompressed and is
 * fetched only on this page.
 */
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

let loading: Promise<void> | undefined;

async function ensureReader(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const wasmBinary = await fetch(wasmUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load the QR decoder (${response.status}).`);
      }
      return response.arrayBuffer();
    });
    await prepareZXingModule({
      fireImmediately: true,
      overrides: { wasmBinary },
    });
  })();
  try {
    await loading;
  } catch (error) {
    loading = undefined;
    throw error;
  }
}

export interface QrHit {
  readonly text: string;
  readonly format: string;
}

export async function decodeQr(input: Blob | ImageData): Promise<QrHit[]> {
  await ensureReader();
  const results = await readBarcodes(input, {
    formats: ['QRCode'],
    maxNumberOfSymbols: 8,
    tryHarder: true,
  });
  return results
    .filter((result) => result.isValid && result.text !== '')
    .map((result) => ({ text: result.text, format: result.format }));
}
