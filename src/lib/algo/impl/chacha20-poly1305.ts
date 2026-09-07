import { decryptChacha20Poly1305, encryptChacha20Poly1305 } from '../chacha';
import type { CipherImpl } from '../cipher';

const impl: CipherImpl = {
  encrypt: (data, params) => encryptChacha20Poly1305(params.key, params.iv, data, params.aad),
  decrypt: (data, params) => decryptChacha20Poly1305(params.key, params.iv, data, params.aad),
};

export default impl;
