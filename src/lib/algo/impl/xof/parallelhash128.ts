import { parallelhash128 } from '@noble/hashes/sha3-addons.js';
import { fromMessage } from '../../xof-adapt';

// No streaming form: ParallelHash partitions the message into B-byte blocks,
// so feeding it in arbitrary pieces is the caller's problem, not the hash's.
export default fromMessage(parallelhash128, false);
