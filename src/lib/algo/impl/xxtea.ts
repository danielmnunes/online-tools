import type { CipherImpl } from '../cipher';
import { withPadding } from '../padding';
import { decryptXxtea, encryptXxtea } from '../legacy/xxtea';

const impl: CipherImpl = {
  encrypt: (data, params) =>
    withPadding(8, params.padding, data, 'encrypt', (aligned) => encryptXxtea(params.key, aligned)),
  decrypt: (data, params) =>
    withPadding(8, params.padding, data, 'decrypt', (aligned) => decryptXxtea(params.key, aligned)),
};

export default impl;
