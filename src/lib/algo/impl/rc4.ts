import type { CipherImpl } from '../cipher';
import { rc4 } from '../legacy/rc4';

const impl: CipherImpl = {
  encrypt: (data, params) => rc4(params.key, data),
  decrypt: (data, params) => rc4(params.key, data),
};

export default impl;
