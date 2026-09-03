import { cshake256 } from '@noble/hashes/sha3-addons.js';
import { fromMessage } from '../../xof-adapt';

export default fromMessage(cshake256);
