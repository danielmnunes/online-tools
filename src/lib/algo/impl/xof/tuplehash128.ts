import { tuplehash128 } from '@noble/hashes/sha3-addons.js';
import { fromTuple } from '../../xof-adapt';

export default fromTuple(tuplehash128);
