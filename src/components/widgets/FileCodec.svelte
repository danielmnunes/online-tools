<script lang="ts">
  import { untrack } from 'svelte';
  import { CODECS, type CodecDirection, type CodecId } from '~/lib/algo/codecs';
  import {
    MAX_ENCODED_CHARS,
    createStreamingEncoder,
    decodeText,
    defaultOptions,
  } from '~/lib/codec';
  import { readChunks, readText } from '~/lib/file';
  import { formatBytes, formatDuration } from '~/lib/format';
  import { bytesToHex } from '~/lib/encoding';
  import FileDrop from '~/components/ui/FileDrop.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';

  interface Props {
    codec: CodecId;
    direction: CodecDirection;
  }
  let { codec, direction }: Props = $props();

  const meta = $derived(CODECS[codec]);

  /**
   * How much of an encoded file is put on the page.
   *
   * A 10 MB file is 13.4 million characters of Base64, which no browser
   * renders and nobody reads. The whole thing is still available through the
   * download button; what is shown is enough to check and to copy by hand.
   */
  const SHOWN_CHARS = 20_000;

  let file = $state<File | undefined>(undefined);
  let options = $state<Record<string, string>>(untrack(() => defaultOptions(codec)));
  let asDataUrl = $state(false);

  let encoded = $state('');
  let truncated = $state(false);
  let decoded = $state<Uint8Array | undefined>(undefined);
  let decodedUrl = $state<string | undefined>(undefined);
  let error = $state<string | undefined>(undefined);
  let progress = $state(0);
  let running = $state(false);
  let elapsed = $state<number | undefined>(undefined);

  let controller: AbortController | undefined;

  function revoke() {
    decodedUrl = undefined;
  }

  /**
   * The download for a decoded file, as a blob URL created and released here.
   *
   * Created in an effect rather than in decodeFile so that the revoke cannot
   * be missed: leaving the page after decoding a large file would otherwise
   * pin the whole thing for as long as the document lives.
   */
  $effect(() => {
    const bytes = decoded;
    if (bytes === undefined) {
      decodedUrl = undefined;
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes.slice()]));
    decodedUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  async function encodeFile(selected: File) {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    file = selected;
    encoded = '';
    truncated = false;
    decoded = undefined;
    revoke();
    error = undefined;
    elapsed = undefined;
    progress = 0;
    running = true;

    const startedAt = performance.now();
    try {
      // The ceiling is enforced by the encoder as it goes, so a file that is
      // far too large stops being read within a chunk or two.
      const encoder = createStreamingEncoder(codec, options, { maxChars: MAX_ENCODED_CHARS });
      await readChunks(selected, (chunk) => encoder.update(chunk), {
        signal,
        onProgress: (fraction) => {
          if (!signal.aborted) progress = fraction;
        },
        abortMessage: 'Encoding cancelled.',
      });
      if (signal.aborted) return;
      encoded = encoder.finish();
      truncated = encoded.length > SHOWN_CHARS;
      elapsed = performance.now() - startedAt;
    } catch (e) {
      if (signal.aborted) return;
      error = e instanceof Error ? e.message : 'The file could not be encoded.';
    } finally {
      if (!signal.aborted) running = false;
    }
  }

  async function decodeFile(selected: File) {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    file = selected;
    encoded = '';
    truncated = false;
    decoded = undefined;
    revoke();
    error = undefined;
    elapsed = undefined;
    progress = 0;
    running = true;

    const startedAt = performance.now();
    try {
      // The input is text by definition: it is an encoded file. It is read in
      // chunks so that progress means something on a large one.
      const text = await readText(selected, {
        signal,
        onProgress: (fraction) => {
          if (!signal.aborted) progress = fraction;
        },
        abortMessage: 'Decoding cancelled.',
      });
      if (signal.aborted) return;
      const bytes = await decodeText(codec, text, options);
      if (signal.aborted) return;
      decoded = bytes;
      elapsed = performance.now() - startedAt;
    } catch (e) {
      if (signal.aborted) return;
      error = e instanceof Error ? e.message : 'The file could not be decoded.';
    } finally {
      if (!signal.aborted) running = false;
    }
  }

  function run(selected: File) {
    void (direction === 'encode' ? encodeFile(selected) : decodeFile(selected));
  }

  // Any option change makes what is on screen wrong, so redo it rather than
  // leaving a stale result beside the new settings.
  //
  // Each value is read, not the object: `options` is a $state proxy, which
  // subscribes per property. Reading the reference alone would never fire
  // again -- and on the first run `file` is still undefined, so nothing below
  // the guard would have read a property either.
  $effect(() => {
    for (const control of meta.controls) void options[control.id];
    void asDataUrl;
    // Untracked: choosing a file already calls run() through the drop target,
    // and this effect is not what should follow the file.
    const current = untrack(() => file);
    if (current !== undefined) run(current);
  });

  function cancel() {
    controller?.abort();
    running = false;
    progress = 0;
  }

  function reset() {
    controller?.abort();
    file = undefined;
    encoded = '';
    truncated = false;
    decoded = undefined;
    revoke();
    error = undefined;
    elapsed = undefined;
    progress = 0;
    running = false;
  }

  /** The type the browser reports for the file, which a data URL needs. */
  const mimeType = $derived(file?.type || 'application/octet-stream');

  /**
   * The same encoding, written the way a `data:` URL requires.
   *
   * `data:<type>;base64,` promises RFC 4648: the standard alphabet, padded and
   * unwrapped. All three selects on this page can produce something else --
   * the URL-safe alphabet swaps two characters, padding can be off, and
   * wrapping puts newlines inside the URL -- so the wrapper normalises rather
   * than handing out a URL that will not open.
   */
  function asStandardBase64(text: string): string {
    const flat = text
      .replace(/\s/g, '')
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/=+$/, '');
    return flat + '='.repeat((4 - (flat.length % 4)) % 4);
  }

  const shown = $derived(
    asDataUrl
      ? `data:${mimeType};base64,${asStandardBase64(encoded.slice(0, SHOWN_CHARS - (SHOWN_CHARS % 4)))}`
      : encoded.slice(0, SHOWN_CHARS),
  );

  /**
   * The encoded text as a blob URL, so that "Download" needs no server and no
   * data: attribute holding megabytes of text in the HTML.
   *
   * The cleanup function is the point of doing it here: a URL created in a
   * derived value would leak one blob per keystroke.
   */
  let encodeUrl = $state<string | undefined>(undefined);
  $effect(() => {
    void encoded;
    void asDataUrl;
    void mimeType;
    if (encoded === '') {
      encodeUrl = undefined;
      return;
    }
    const body = asDataUrl ? `data:${mimeType};base64,${asStandardBase64(encoded)}` : encoded;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    encodeUrl = url;
    return () => URL.revokeObjectURL(url);
  });

  const downloadHref = $derived(direction === 'decode' ? decodedUrl : encodeUrl);

  const downloadName = $derived.by(() => {
    const base = (file?.name ?? 'file').replace(/\.[^.]*$/, '');
    return direction === 'encode' ? `${base}.${codec}.txt` : `${base}.bin`;
  });

  /** Enough of the decoded bytes to see what arrived, never the whole file. */
  const preview = $derived.by(() => {
    if (decoded === undefined) return undefined;
    const head = decoded.subarray(0, 256);
    const looksLikeText = head.every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 0x20 && byte <= 0x7e));
    return looksLikeText ? new TextDecoder().decode(head) : bytesToHex(head);
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  {#if file === undefined}
    <FileDrop onfile={run} />
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div class="min-w-0">
        <p class="truncate font-mono text-sm text-fg">{file.name}</p>
        <p class="text-xs text-muted">
          {formatBytes(file.size)}{#if elapsed !== undefined}{` · ${direction === 'encode' ? 'encoded' : 'decoded'} in ${formatDuration(elapsed)}`}{/if}
        </p>
      </div>
      <div class="flex gap-2">
        {#if running}
          <button
            type="button"
            onclick={cancel}
            class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
          >Cancel</button>
        {/if}
        <button
          type="button"
          onclick={reset}
          class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
        >Choose another</button>
      </div>
    </div>
  {/if}

  {#if running}
    <div>
      <div
        class="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(progress * 100)}
        aria-label="{direction === 'encode' ? 'Encoding' : 'Decoding'} progress"
      >
        <div
          class="h-full rounded-full bg-accent transition-[width] duration-150"
          style="width: {progress * 100}%"
        ></div>
      </div>
      <p class="mt-1 text-xs text-muted">
        {direction === 'encode' ? 'Encoding' : 'Reading and decoding'}… {Math.round(progress * 100)}%
      </p>
    </div>
  {/if}

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    {#each meta.controls.filter((control) => control.appliesTo === 'both' || control.appliesTo === direction) as control (control.id)}
      <Field label={control.label} for="file-codec-{control.id}" hint={control.hint}>
        <Select
          id="file-codec-{control.id}"
          bind:value={options[control.id]}
          options={control.options}
        />
      </Field>
    {/each}

    {#if direction === 'encode' && codec === 'base64'}
      <!-- A data URL is what most people encoding a file actually want, and
           it is four characters of prefix over the same Base64. -->
      <label class="mb-0.5 flex items-center gap-2 self-end text-xs font-medium text-muted">
        <input
          type="checkbox"
          bind:checked={asDataUrl}
          class="size-4 rounded border-border accent-accent"
        />
        Wrap as a data URL
      </label>
    {/if}
  </div>

  {#if direction === 'encode'}
    <OutputArea
      value={shown}
      {error}
      pending={running}
      label="{meta.label} of the file"
      meta={encoded !== '' ? `${formatBytes(encoded.length)} of text` : undefined}
    />
    {#if truncated}
      <p class="-mt-2 text-xs text-muted">
        Showing the first {SHOWN_CHARS.toLocaleString()} characters. The download button has all of
        it.
      </p>
    {/if}

    {#if encoded !== '' && error === undefined}
      <div class="flex flex-wrap items-center gap-3">
        <a
          href={downloadHref}
          download={downloadName}
          class="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg
                 transition-opacity hover:opacity-90
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >Download as text</a>
        <CopyButton text={shown} label={truncated ? 'Copy what is shown' : 'Copy'} />
      </div>
    {/if}
  {:else}
    <OutputArea
      value={preview ?? ''}
      {error}
      pending={running}
      label="Decoded bytes"
      meta={decoded !== undefined ? `${formatBytes(decoded.length)}` : undefined}
    />

    {#if decoded !== undefined && error === undefined}
      <div class="flex flex-wrap items-center gap-3">
        <a
          href={downloadHref}
          download={downloadName}
          class="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg
                 transition-opacity hover:opacity-90
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >Download the decoded file</a>
        <span class="text-xs text-muted">
          {formatBytes(decoded.length)}{#if decoded.length === 0}{' — the input decoded to nothing'}{/if}
        </span>
      </div>
      <p class="text-xs text-muted">
        Saved as {downloadName}. The name is guessed from the file you dropped; the bytes are what
        the decoder read.
      </p>
    {/if}
  {/if}
</div>
