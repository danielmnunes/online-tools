/**
 * PEM encode and decode, for the keys this site actually handles.
 *
 * A PEM block is a Base64 DER blob between BEGIN/END labels. The Web Crypto
 * API wants the DER; people paste the PEM. The conversion is mechanical, and
 * living in one place means the JWT verifier and the RSA/ECDSA pages refuse
 * the same PKCS#1 forms for the same reason, with the same openssl command.
 */
import { DecodeError, base64ToBytes, bytesToBase64 } from './encoding';

export interface PemBlock {
  readonly label: string;
  readonly der: Uint8Array;
}

const PEM_RE = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;

/** The DER bytes out of a PEM block. Throws DecodeError with something readable. */
export function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  return parsePem(pem).der as Uint8Array<ArrayBuffer>;
}

export function parsePem(pem: string): PemBlock {
  const match = PEM_RE.exec(pem.trim());
  if (match === null) {
    throw new DecodeError(
      'that is not a PEM block. It has to start with -----BEGIN …----- and end with the matching -----END …-----.',
    );
  }
  const [, label = '', body = ''] = match;

  if (label.includes('RSA PUBLIC KEY')) {
    throw new DecodeError(
      'that is a PKCS#1 RSA public key. The browser wants the SubjectPublicKeyInfo form: ' +
        'openssl rsa -RSAPublicKey_in -pubin -out public.pem',
    );
  }
  if (label === 'RSA PRIVATE KEY') {
    throw new DecodeError(
      'that is a PKCS#1 RSA private key. The browser wants PKCS#8: openssl pkcs8 -topk8 -nocrypt -in key.pem',
    );
  }
  if (label === 'EC PRIVATE KEY') {
    throw new DecodeError(
      'that is a SEC1 EC private key. The browser wants PKCS#8: openssl pkcs8 -topk8 -nocrypt -in key.pem',
    );
  }

  try {
    return { label, der: base64ToBytes(body) };
  } catch {
    throw new DecodeError('the base64 inside the PEM block does not decode.');
  }
}

export function derToPem(label: string, der: Uint8Array): string {
  const b64 = bytesToBase64(der);
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

export function isJwk(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}
