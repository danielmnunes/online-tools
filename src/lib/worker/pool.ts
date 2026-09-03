/**
 * A small pool of workers for the jobs that would otherwise freeze the page.
 *
 * Argon2 at 19 MiB and bcrypt at cost 12 both run for a second or more of
 * solid CPU. noble's async variants yield to the event loop on a timer, which
 * keeps a progress bar updating, but the main thread still does the work: text
 * selection stutters, animations drop frames, and a big enough parameter locks
 * the tab. Moving the work to a worker is the only real fix.
 *
 * Three things this has to get right:
 *
 *  - **Cancellation.** A worker running a tight loop cannot be interrupted by
 *    a flag; the only reliable stop is terminate(). So cancelling kills that
 *    worker, and the pool spawns a fresh one next time it needs it.
 *  - **Progress.** Messages flow back while the job runs, not only at the end.
 *  - **Somewhere to run without workers.** jsdom has no Worker, and neither
 *    does the Astro build. The pool falls back to running the job inline, so
 *    the tests exercise the same code path the browser does, minus the thread.
 */

export interface JobHooks {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Messages the worker sends back. Anything else is a protocol error. */
export type WorkerReply<Res> =
  | { readonly id: number; readonly type: 'progress'; readonly fraction: number }
  | { readonly id: number; readonly type: 'done'; readonly result: Res }
  | { readonly id: number; readonly type: 'error'; readonly message: string };

export interface PoolOptions<Req, Res> {
  /**
   * Makes a fresh worker. Called lazily, and again whenever one is terminated,
   * so it must be safe to call more than once.
   */
  readonly spawn: () => Worker;
  /** Runs the job on the calling thread, for when workers are unavailable. */
  readonly fallback: (request: Req, hooks: JobHooks) => Promise<Res>;
  /** Most workers to keep alive at once. */
  readonly size?: number;
}

interface Job<Req, Res> {
  readonly request: Req;
  readonly hooks: JobHooks;
  readonly resolve: (value: Res) => void;
  readonly reject: (reason: unknown) => void;
}

interface Slot {
  readonly worker: Worker;
  busy: boolean;
}

function defaultSize(): number {
  const cores = typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency;
  return Math.max(1, Math.min(4, cores ?? 2));
}

export class WorkerPool<Req, Res> {
  readonly #options: PoolOptions<Req, Res>;
  readonly #size: number;
  readonly #slots: Slot[] = [];
  readonly #queue: Job<Req, Res>[] = [];
  /** Jobs already handed to a worker, so destroy() can settle them too. */
  readonly #inFlight = new Set<(reason: unknown) => void>();
  #nextId = 1;

  constructor(options: PoolOptions<Req, Res>) {
    this.#options = options;
    this.#size = options.size ?? defaultSize();
  }

  /** Whether jobs actually go to another thread, or run inline. */
  get usingWorkers(): boolean {
    return typeof Worker !== 'undefined';
  }

  async run(request: Req, hooks: JobHooks = {}): Promise<Res> {
    if (hooks.signal?.aborted) {
      throw new DOMException('Cancelled.', 'AbortError');
    }
    if (!this.usingWorkers) {
      return this.#options.fallback(request, hooks);
    }
    return new Promise<Res>((resolve, reject) => {
      this.#queue.push({ request, hooks, resolve, reject });
      this.#pump();
    });
  }

  /**
   * Terminates every worker and settles everything outstanding. The pool stays
   * usable afterwards and will spawn again on the next run().
   *
   * Rejecting the in-flight jobs matters: their workers are about to stop
   * existing, so nothing else would ever settle those promises, and a caller
   * awaiting one would hang for the life of the page.
   */
  destroy(): void {
    for (const slot of this.#slots) slot.worker.terminate();
    this.#slots.length = 0;

    const reason = new DOMException('Pool destroyed.', 'AbortError');
    for (const abandon of this.#inFlight) abandon(reason);
    this.#inFlight.clear();

    for (const job of this.#queue) job.reject(reason);
    this.#queue.length = 0;
  }

  #pump(): void {
    while (this.#queue.length > 0) {
      const slot = this.#freeSlot();
      if (slot === undefined) return;
      const job = this.#queue.shift()!;
      this.#dispatch(slot, job);
    }
  }

  #freeSlot(): Slot | undefined {
    const idle = this.#slots.find((slot) => !slot.busy);
    if (idle !== undefined) return idle;
    if (this.#slots.length >= this.#size) return undefined;

    const slot: Slot = { worker: this.#options.spawn(), busy: false };
    this.#slots.push(slot);
    return slot;
  }

  #dispatch(slot: Slot, job: Job<Req, Res>): void {
    const id = this.#nextId++;
    slot.busy = true;

    /** Called once, however the job ends, to unhook everything. */
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      this.#inFlight.delete(abandon);
      slot.worker.removeEventListener('message', onMessage);
      slot.worker.removeEventListener('error', onError);
      job.hooks.signal?.removeEventListener('abort', onAbort);
      fn();
    };

    /** How destroy() settles this job: the worker is already gone by then. */
    const abandon = (reason: unknown): void => {
      finish(() => job.reject(reason));
    };
    this.#inFlight.add(abandon);

    const release = (): void => {
      slot.busy = false;
      this.#pump();
    };

    /** Cancellation means killing the thread; nothing else stops a busy loop. */
    const discard = (): void => {
      slot.worker.terminate();
      const at = this.#slots.indexOf(slot);
      if (at >= 0) this.#slots.splice(at, 1);
      this.#pump();
    };

    const onMessage = (event: MessageEvent<WorkerReply<Res>>): void => {
      const reply = event.data;
      if (reply.id !== id) return;
      switch (reply.type) {
        case 'progress':
          job.hooks.onProgress?.(reply.fraction);
          return;
        case 'done':
          finish(() => {
            release();
            job.resolve(reply.result);
          });
          return;
        case 'error':
          finish(() => {
            release();
            job.reject(new Error(reply.message));
          });
      }
    };

    const onError = (event: ErrorEvent): void => {
      finish(() => {
        discard();
        job.reject(new Error(event.message || 'The worker failed.'));
      });
    };

    const onAbort = (): void => {
      finish(() => {
        discard();
        job.reject(new DOMException('Cancelled.', 'AbortError'));
      });
    };

    slot.worker.addEventListener('message', onMessage);
    slot.worker.addEventListener('error', onError);
    job.hooks.signal?.addEventListener('abort', onAbort, { once: true });

    slot.worker.postMessage({ id, request: job.request });
  }
}
