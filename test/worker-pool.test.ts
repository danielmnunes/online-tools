/**
 * The worker pool, exercised with a fake Worker.
 *
 * jsdom has no Worker, which is itself one of the behaviours worth pinning:
 * the pool has to notice and run the job inline rather than throw. The rest
 * uses a stub that implements just enough of the interface -- addEventListener,
 * postMessage, terminate -- to drive the protocol from the test.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerPool } from '~/lib/worker/pool';

type Handler = (event: unknown) => void;

/** A Worker that answers whatever the test tells it to. */
class FakeWorker {
  static live = 0;
  static instances: FakeWorker[] = [];

  readonly handlers = new Map<string, Set<Handler>>();
  readonly sent: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.live++;
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, handler: Handler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: Handler): void {
    this.handlers.get(type)?.delete(handler);
  }

  postMessage(message: unknown): void {
    this.sent.push(message);
  }

  terminate(): void {
    this.terminated = true;
    FakeWorker.live--;
  }

  /** Deliver a message as if the worker had sent it. */
  reply(data: unknown): void {
    for (const handler of this.handlers.get('message') ?? []) handler({ data });
  }

  fail(message: string): void {
    for (const handler of this.handlers.get('error') ?? []) handler({ message });
  }

  /** The id the pool assigned to the job it most recently sent here. */
  get lastId(): number {
    return (this.sent.at(-1) as { id: number }).id;
  }
}

function makePool(size = 1) {
  FakeWorker.live = 0;
  FakeWorker.instances = [];
  return new WorkerPool<string, string>({
    spawn: () => new FakeWorker() as unknown as Worker,
    fallback: async (request) => `inline:${request}`,
    size,
  });
}

/** Lets queued microtasks run, so the pool's own promise plumbing settles. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const withWorkerGlobal = (fn: () => Promise<void>) => async () => {
  vi.stubGlobal('Worker', FakeWorker);
  try {
    await fn();
  } finally {
    vi.unstubAllGlobals();
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('without a Worker global', () => {
  it('runs the job inline instead of failing', async () => {
    const pool = makePool();
    expect(pool.usingWorkers).toBe(false);
    expect(await pool.run('job')).toBe('inline:job');
    expect(FakeWorker.live).toBe(0);
  });

  it('still refuses a job that is already cancelled', async () => {
    const pool = makePool();
    const controller = new AbortController();
    controller.abort();
    await expect(pool.run('job', { signal: controller.signal })).rejects.toThrow(/cancelled/i);
  });
});

describe('with workers', () => {
  it(
    'sends the request and resolves with what comes back',
    withWorkerGlobal(async () => {
      const pool = makePool();
      expect(pool.usingWorkers).toBe(true);

      const promise = pool.run('hash me');
      await settle();

      const worker = FakeWorker.instances[0]!;
      expect(worker.sent).toHaveLength(1);
      expect((worker.sent[0] as { request: string }).request).toBe('hash me');

      worker.reply({ id: worker.lastId, type: 'done', result: 'a digest' });
      expect(await promise).toBe('a digest');
    }),
  );

  it(
    'forwards progress without settling the job',
    withWorkerGlobal(async () => {
      const pool = makePool();
      const seen: number[] = [];
      const promise = pool.run('job', { onProgress: (f) => seen.push(f) });
      await settle();

      const worker = FakeWorker.instances[0]!;
      worker.reply({ id: worker.lastId, type: 'progress', fraction: 0.25 });
      worker.reply({ id: worker.lastId, type: 'progress', fraction: 0.75 });
      expect(seen).toEqual([0.25, 0.75]);

      worker.reply({ id: worker.lastId, type: 'done', result: 'done' });
      expect(await promise).toBe('done');
    }),
  );

  it(
    'turns an error reply into a rejection carrying the message',
    withWorkerGlobal(async () => {
      const pool = makePool();
      const promise = pool.run('job');
      await settle();

      const worker = FakeWorker.instances[0]!;
      worker.reply({ id: worker.lastId, type: 'error', message: 'N must be a power of two' });
      await expect(promise).rejects.toThrow('N must be a power of two');
    }),
  );

  it(
    'reuses one worker across sequential jobs',
    withWorkerGlobal(async () => {
      const pool = makePool();

      for (const value of ['one', 'two', 'three']) {
        const promise = pool.run(value);
        await settle();
        const worker = FakeWorker.instances[0]!;
        worker.reply({ id: worker.lastId, type: 'done', result: value });
        expect(await promise).toBe(value);
      }

      expect(FakeWorker.instances).toHaveLength(1);
    }),
  );

  it(
    'queues while the pool is full and starts the next job on release',
    withWorkerGlobal(async () => {
      const pool = makePool(1);
      const first = pool.run('first');
      const second = pool.run('second');
      await settle();

      const worker = FakeWorker.instances[0]!;
      expect(FakeWorker.instances).toHaveLength(1);
      expect(worker.sent).toHaveLength(1);

      worker.reply({ id: worker.lastId, type: 'done', result: 'first done' });
      expect(await first).toBe('first done');
      await settle();

      expect(worker.sent).toHaveLength(2);
      worker.reply({ id: worker.lastId, type: 'done', result: 'second done' });
      expect(await second).toBe('second done');
    }),
  );

  it(
    'grows to the configured size before queueing',
    withWorkerGlobal(async () => {
      const pool = makePool(2);
      const jobs = [pool.run('a'), pool.run('b'), pool.run('c')];
      await settle();

      expect(FakeWorker.instances).toHaveLength(2);
      for (const worker of FakeWorker.instances) {
        worker.reply({ id: worker.lastId, type: 'done', result: 'ok' });
      }
      await settle();
      FakeWorker.instances[0]!.reply({
        id: FakeWorker.instances[0]!.lastId,
        type: 'done',
        result: 'ok',
      });
      expect(await Promise.all(jobs)).toEqual(['ok', 'ok', 'ok']);
    }),
  );

  it(
    'terminates the worker on cancellation, because a busy loop cannot be asked to stop',
    withWorkerGlobal(async () => {
      const pool = makePool();
      const controller = new AbortController();
      const promise = pool.run('job', { signal: controller.signal });
      await settle();

      const worker = FakeWorker.instances[0]!;
      controller.abort();
      await expect(promise).rejects.toThrow(/cancelled/i);
      expect(worker.terminated).toBe(true);
    }),
  );

  it(
    'spawns a fresh worker for the job after a cancellation',
    withWorkerGlobal(async () => {
      const pool = makePool();
      const controller = new AbortController();
      const cancelled = pool.run('doomed', { signal: controller.signal });
      await settle();
      controller.abort();
      await expect(cancelled).rejects.toThrow(/cancelled/i);

      const promise = pool.run('next');
      await settle();
      expect(FakeWorker.instances).toHaveLength(2);

      const fresh = FakeWorker.instances[1]!;
      fresh.reply({ id: fresh.lastId, type: 'done', result: 'recovered' });
      expect(await promise).toBe('recovered');
    }),
  );

  it(
    'ignores replies carrying another job’s id',
    withWorkerGlobal(async () => {
      const pool = makePool();
      const promise = pool.run('job');
      await settle();

      const worker = FakeWorker.instances[0]!;
      worker.reply({ id: worker.lastId + 999, type: 'done', result: 'not mine' });
      worker.reply({ id: worker.lastId, type: 'done', result: 'mine' });
      expect(await promise).toBe('mine');
    }),
  );

  it(
    'rejects when the worker itself errors, and drops it',
    withWorkerGlobal(async () => {
      const pool = makePool();
      const promise = pool.run('job');
      await settle();

      const worker = FakeWorker.instances[0]!;
      worker.fail('script load failed');
      await expect(promise).rejects.toThrow('script load failed');
      expect(worker.terminated).toBe(true);
    }),
  );

  it(
    'destroy() terminates everything and rejects what was queued',
    withWorkerGlobal(async () => {
      const pool = makePool(1);
      const running = pool.run('running');
      const queued = pool.run('queued');
      await settle();

      pool.destroy();
      await expect(queued).rejects.toThrow(/destroyed/i);
      await expect(running).rejects.toThrow(/destroyed/i);
      expect(FakeWorker.instances[0]!.terminated).toBe(true);
    }),
  );
});
