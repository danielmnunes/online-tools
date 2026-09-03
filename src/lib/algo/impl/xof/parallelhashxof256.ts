import { parallelhash256xof } from '@noble/hashes/sha3-addons.js';
import { fromMessage } from '../../xof-adapt';

export default fromMessage(parallelhash256xof, false);
