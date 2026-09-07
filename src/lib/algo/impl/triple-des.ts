import type { CipherImpl } from '../cipher';
import { withPadding } from '../padding';
import {
  decryptTripleDesCbc,
  decryptTripleDesEcb,
  encryptTripleDesCbc,
  encryptTripleDesEcb,
} from '../legacy/des';

const impl: CipherImpl = {
  encrypt: (data, params) =>
    withPadding(8, params.padding, data, 'encrypt', (aligned) =>
      params.mode === 'cbc'
        ? encryptTripleDesCbc(params.key, params.iv, aligned)
        : encryptTripleDesEcb(params.key, aligned),
    ),
  decrypt: (data, params) =>
    withPadding(8, params.padding, data, 'decrypt', (aligned) =>
      params.mode === 'cbc'
        ? decryptTripleDesCbc(params.key, params.iv, aligned)
        : decryptTripleDesEcb(params.key, aligned),
    ),
};

export default impl;
