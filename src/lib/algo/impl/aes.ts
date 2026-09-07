import { decryptAes, encryptAes } from '../aes';
import type { CipherImpl } from '../cipher';

const impl: CipherImpl = {
  encrypt: (data, params) => encryptAes(data, params),
  decrypt: (data, params) => decryptAes(data, params),
};

export default impl;
