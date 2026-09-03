/**
 * What crosses the wire between the page and the KDF worker.
 *
 * Kept in its own module with no imports of substance, so the main thread can
 * describe a job without pulling in any of the code that performs it.
 * Everything here is structured-cloneable: Uint8Arrays travel as themselves.
 */
import type { KdfId } from '../algo/kdfs';

export interface KdfJobInputs {
  readonly password: Uint8Array;
  readonly salt: Uint8Array;
  readonly info?: Uint8Array;
  readonly secret?: Uint8Array;
  readonly associatedData?: Uint8Array;
  readonly hash?: string;
  readonly cost: Readonly<Record<string, number>>;
  readonly dkLen: number;
}

export type KdfRequest =
  | { readonly kind: 'derive'; readonly algorithm: KdfId; readonly inputs: KdfJobInputs }
  | {
      readonly kind: 'verify';
      readonly algorithm: KdfId;
      readonly inputs: KdfJobInputs;
      readonly expected: string;
    };

export interface DeriveReply {
  readonly key: Uint8Array;
  readonly encoded?: string;
}

export interface VerifyReply {
  readonly matches: boolean;
  readonly source: 'encoded' | 'raw';
  readonly parameters: string;
  readonly computed: Uint8Array;
}

export type KdfResponse = DeriveReply | VerifyReply;
