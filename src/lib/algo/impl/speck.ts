import type { CipherImpl } from '../cipher';
import { withPadding } from '../padding';
import {
  decryptSpeckCbc,
  decryptSpeckEcb,
  encryptSpeckCbc,
  encryptSpeckEcb,
} from '../legacy/speck';

const impl: CipherImpl = {
  encrypt: (data, params) =>
    withPadding(16, params.padding, data, 'encrypt', (aligned) =>
      params.mode === 'cbc'
        ? encryptSpeckCbc(params.key, params.iv, aligned)
        : encryptSpeckEcb(params.key, aligned),
    ),
  decrypt: (data, params) =>
    withPadding(16, params.padding, data, 'decrypt', (aligned) =>
      params.mode === 'cbc'
        ? decryptSpeckCbc(params.key, params.iv, aligned)
        : decryptSpeckEcb(params.key, aligned),
    ),
};

export default impl;
