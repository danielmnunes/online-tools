import { tuplehash256xof } from '@noble/hashes/sha3-addons.js';
import { fromTuple } from '../../xof-adapt';

export default fromTuple(tuplehash256xof);
