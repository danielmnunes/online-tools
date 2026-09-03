import { cshake128 } from '@noble/hashes/sha3-addons.js';
import { fromMessage } from '../../xof-adapt';

export default fromMessage(cshake128);
