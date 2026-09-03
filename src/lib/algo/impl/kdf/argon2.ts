import { argon2dAsync, argon2iAsync, argon2idAsync } from '@noble/hashes/argon2.js';
import type { Argon2Id } from '../../kdfs';

export const ARGON2 = {
  argon2d: argon2dAsync,
  argon2i: argon2iAsync,
  argon2id: argon2idAsync,
} as const satisfies Record<Argon2Id, unknown>;
