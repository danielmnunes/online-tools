import { tuplehash128xof } from '@noble/hashes/sha3-addons.js';
import { fromTuple } from '../../xof-adapt';

export default fromTuple(tuplehash128xof);
