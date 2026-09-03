import { kmac256 } from '@noble/hashes/sha3-addons.js';
import { fromKeyed } from '../../xof-adapt';

export default fromKeyed(kmac256);
