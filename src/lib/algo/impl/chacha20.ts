import { decryptChacha20, encryptChacha20 } from '../chacha';
import type { CipherImpl } from '../cipher';

const impl: CipherImpl = {
  encrypt: (data, params) => encryptChacha20(params.key, params.iv, data),
  decrypt: (data, params) => decryptChacha20(params.key, params.iv, data),
};

export default impl;
