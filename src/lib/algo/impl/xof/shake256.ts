import { shake256 } from '@noble/hashes/sha3.js';
import { fromMessage } from '../../xof-adapt';

export default fromMessage(shake256);
