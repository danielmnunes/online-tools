import { shake128 } from '@noble/hashes/sha3.js';
import { fromMessage } from '../../xof-adapt';

export default fromMessage(shake128);
