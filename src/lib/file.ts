/**
 * Reading a file a chunk at a time.
 *
 * Through slice() rather than arrayBuffer(), which is the whole point: a 4 GB
 * file is processed with one chunk resident at a time instead of the entire
 * file. Slicing explicitly rather than using blob.stream() keeps the chunk
 * size ours, which makes progress granularity and yielding predictable rather
 * than dependent on how a particular browser chooses to feed the stream.
 */

export interface ReadChunksOptions {
  /** Called with a value from 0 to 1 as the file is consumed. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** Bytes per read. */
  chunkSize?: number;
  /** What the AbortError is about: the caller knows, this module does not. */
  abortMessage?: string;
}

/**
 * Large enough that the per-chunk overhead is negligible, small enough that
 * the await between chunks hands control back to the browser often enough to
 * keep the page repainting and the progress bar moving.
 */
export const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Feed a blob to `consume`, one chunk at a time.
 *
 * `consume` may be async, which is how the awaits between chunks end up
 * yielding to the browser even when the consumer is pure computation.
 */
export async function readChunks(
  blob: Blob,
  consume: (chunk: Uint8Array) => void | Promise<void>,
  { onProgress, signal, chunkSize = DEFAULT_CHUNK_SIZE, abortMessage = 'Cancelled.' }: ReadChunksOptions = {},
): Promise<void> {
  const throwIfAborted = (): void => {
    if (signal?.aborted) throw new DOMException(abortMessage, 'AbortError');
  };

  throwIfAborted();
  const total = blob.size;

  for (let offset = 0; offset < total; ) {
    throwIfAborted();
    const end = Math.min(offset + chunkSize, total);
    const buffer = await blob.slice(offset, end).arrayBuffer();
    await consume(new Uint8Array(buffer));
    offset = end;
    onProgress?.(offset / total);
  }

  // An empty file never enters the loop but is nonetheless finished.
  if (total === 0) onProgress?.(1);
}

/** Read a whole blob as text, chunk by chunk so that progress can be shown. */
export async function readText(
  blob: Blob,
  options: ReadChunksOptions = {},
): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  const parts: string[] = [];
  await readChunks(
    blob,
    (chunk) => {
      parts.push(decoder.decode(chunk, { stream: true }));
    },
    options,
  );
  parts.push(decoder.decode());
  return parts.join('');
}
