/**
 * The thread that does the expensive part.
 *
 * This module is a bundle entry point of its own: everything it imports --
 * Argon2, scrypt, bcrypt, the hash loaders -- is emitted into the worker
 * chunk and never reaches the page's own bundle. That is a second reason to
 * use a worker beyond keeping the UI responsive.
 */
import { deriveKey, verifyKdf, type KdfInputs } from '../algo/kdf';
import type { HashId } from '../algo/hashes';
import type { KdfJobInputs, KdfRequest, KdfResponse } from './kdf-protocol';

interface Incoming {
  readonly id: number;
  readonly request: KdfRequest;
}

function toInputs(inputs: KdfJobInputs): KdfInputs {
  return {
    password: inputs.password,
    salt: inputs.salt,
    cost: inputs.cost,
    dkLen: inputs.dkLen,
    ...(inputs.info !== undefined ? { info: inputs.info } : {}),
    ...(inputs.secret !== undefined ? { secret: inputs.secret } : {}),
    ...(inputs.associatedData !== undefined ? { associatedData: inputs.associatedData } : {}),
    ...(inputs.hash !== undefined ? { hash: inputs.hash as HashId } : {}),
  };
}

self.addEventListener('message', (event: MessageEvent<Incoming>) => {
  const { id, request } = event.data;

  const post = (message: object): void => {
    (self as unknown as Worker).postMessage({ id, ...message });
  };

  // Progress is throttled to whole percents: a message per Argon2 pass is
  // useful, a message per lane iteration is thousands of postMessage calls
  // that themselves slow the job down.
  let lastSent = -1;
  const onProgress = (fraction: number): void => {
    const percent = Math.floor(fraction * 100);
    if (percent === lastSent) return;
    lastSent = percent;
    post({ type: 'progress', fraction });
  };

  const run = async (): Promise<KdfResponse> => {
    const inputs = toInputs(request.inputs);
    if (request.kind === 'derive') {
      return deriveKey(request.algorithm, inputs, { onProgress });
    }
    return verifyKdf(request.algorithm, request.expected, inputs, { onProgress });
  };

  run().then(
    (result) => post({ type: 'done', result }),
    (error: unknown) => post({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
  );
});
