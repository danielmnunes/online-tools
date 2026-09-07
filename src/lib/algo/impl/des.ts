import type { CipherImpl } from '../cipher';
import { withPadding } from '../padding';
import {
  decryptDesCbc,
  decryptDesEcb,
  encryptDesCbc,
  encryptDesEcb,
} from '../legacy/des';

const impl: CipherImpl = {
  encrypt: (data, params) =>
    withPadding(8, params.padding, data, 'encrypt', (aligned) =>
      params.mode === 'cbc'
        ? encryptDesCbc(params.key, params.iv, aligned)
        : encryptDesEcb(params.key, aligned),
    ),
  decrypt: (data, params) =>
    withPadding(8, params.padding, data, 'decrypt', (aligned) =>
      params.mode === 'cbc'
        ? decryptDesCbc(params.key, params.iv, aligned)
        : decryptDesEcb(params.key, aligned),
    ),
};

export default impl;
