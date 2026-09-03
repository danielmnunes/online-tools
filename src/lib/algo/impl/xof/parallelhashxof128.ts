import { parallelhash128xof } from '@noble/hashes/sha3-addons.js';
import { fromMessage } from '../../xof-adapt';

export default fromMessage(parallelhash128xof, false);
