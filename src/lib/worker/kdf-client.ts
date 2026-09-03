/**
 * The page's side of the KDF worker.
 *
 * One pool, created on first use and shared by whichever widget is on the
 * page. Where Worker does not exist -- the Astro build, jsdom under Vitest --
 * the pool runs the same job inline instead, so there is one code path to
 * reason about and the tests exercise it.
 */
import type { KdfId } from '../algo/kdfs';
import { WorkerPool, type JobHooks } from './pool';
import type { DeriveReply, KdfJobInputs, KdfRequest, KdfResponse, VerifyReply } from './kdf-protocol';

let pool: WorkerPool<KdfRequest, KdfResponse> | undefined;

function getPool(): WorkerPool<KdfRequest, KdfResponse> {
  pool ??= new WorkerPool<KdfRequest, KdfResponse>({
    spawn: () => new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' }),
    // Imported lazily so the algorithms stay out of the page bundle when the
    // browser does have workers, which is every browser this targets.
    fallback: async (request, hooks) => {
      const { deriveKey, verifyKdf } = await import('../algo/kdf');
      const inputs = {
        ...request.inputs,
        hash: request.inputs.hash as never,
      };
      if (request.kind === 'derive') {
        return deriveKey(request.algorithm, inputs, hooks);
      }
      return verifyKdf(request.algorithm, request.expected, inputs, hooks);
    },
    // One derivation at a time is all a single page starts, and each Argon2
    // job wants tens of megabytes; a wider pool would only multiply that.
    size: 1,
  });
  return pool;
}

export async function derive(
  algorithm: KdfId,
  inputs: KdfJobInputs,
  hooks: JobHooks = {},
): Promise<DeriveReply> {
  return (await getPool().run({ kind: 'derive', algorithm, inputs }, hooks)) as DeriveReply;
}

export async function verify(
  algorithm: KdfId,
  inputs: KdfJobInputs,
  expected: string,
  hooks: JobHooks = {},
): Promise<VerifyReply> {
  return (await getPool().run(
    { kind: 'verify', algorithm, inputs, expected },
    hooks,
  )) as VerifyReply;
}

/** Whether the work is actually happening off the main thread. */
export function usingWorkers(): boolean {
  return getPool().usingWorkers;
}
