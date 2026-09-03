<script lang="ts">
  import { untrack } from 'svelte';
  import { HASHES, defaultDkLen, describeRange, type HashId } from '~/lib/algo/hashes';
  import { hashBlob, type HashParams } from '~/lib/algo/hash';
  import {
    INPUT_ENCODINGS,
    OUTPUT_ENCODINGS,
    bytesToText,
    textToBytes,
    type InputEncoding,
    type OutputEncoding,
  } from '~/lib/encoding';
  import { formatBytes, formatDuration } from '~/lib/format';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import FileDrop from '~/components/ui/FileDrop.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';

  interface Props {
    algorithm: HashId;
  }
  let { algorithm }: Props = $props();

  const meta = $derived(HASHES[algorithm]);

  let file = $state<File | undefined>(undefined);
  let outputEncoding = $state<OutputEncoding>('hex');
  let digestBytes = $state<Uint8Array | undefined>(undefined);
  let error = $state<string | undefined>(undefined);
  let progress = $state(0);
  let running = $state(false);
  let elapsed = $state<number | undefined>(undefined);
  let expected = $state('');

  // Only the BLAKE family reaches these: they take a key directly and let the
  // caller pick the digest length. Everything else renders neither control.
  let useKey = $state(false);
  let keyText = $state('');
  let keyEncoding = $state<InputEncoding>('utf-8');
  // untrack because capturing the initial value is the intent: one page is
  // one algorithm, so `algorithm` never changes for a mounted island.
  let dkLen = $state(untrack(() => defaultDkLen(algorithm)));

  const digestBits = $derived((meta.dkLen ? dkLen : meta.bits / 8) * 8);

  let controller: AbortController | undefined;

  /** Throws if the key does not decode, which run() reports like any error. */
  function hashParams(): HashParams {
    const params: HashParams = {};
    if (useKey && meta.key) params.key = textToBytes(keyText, keyEncoding);
    if (meta.dkLen) params.dkLen = dkLen;
    return params;
  }

  const digest = $derived(
    digestBytes ? bytesToText(digestBytes, outputEncoding) : '',
  );

  /**
   * Comparing against a published checksum is the reason most people open a
   * page like this, so it gets a first-class control rather than leaving the
   * user to eyeball 64 hex characters.
   *
   * Normalised on both sides: published checksums arrive in either case, and
   * often pasted with the filename after them as in a sha256sum listing.
   */
  const comparison = $derived.by(() => {
    const candidate = expected.trim().split(/\s+/)[0] ?? '';
    if (candidate === '' || digestBytes === undefined) return undefined;
    // Compare against every output form so a Base64 checksum still matches
    // while the display is set to hex.
    return OUTPUT_ENCODINGS.some(
      ({ value }) => bytesToText(digestBytes!, value).toLowerCase() === candidate.toLowerCase(),
    );
  });

  async function run(selected: File) {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    file = selected;
    digestBytes = undefined;
    error = undefined;
    elapsed = undefined;
    progress = 0;
    running = true;

    const startedAt = performance.now();
    try {
      const out = await hashBlob(algorithm, selected, {
        ...hashParams(),
        signal,
        onProgress: (fraction) => {
          if (!signal.aborted) progress = fraction;
        },
      });
      if (signal.aborted) return;
      digestBytes = out;
      elapsed = performance.now() - startedAt;
    } catch (e) {
      if (signal.aborted) return;
      error = e instanceof Error ? e.message : 'Could not read the file.';
    } finally {
      if (!signal.aborted) running = false;
    }
  }

  // A key or a length change makes the digest on screen wrong, so hash again
  // rather than leaving a stale value beside the new settings. `file` is read
  // untracked: selecting a file already calls run() through the drop target,
  // and tracking it here would hash every new file twice.
  $effect(() => {
    void useKey;
    void keyText;
    void keyEncoding;
    void dkLen;

    const current = untrack(() => file);
    if (current !== undefined) void run(current);
  });

  function cancel() {
    controller?.abort();
    running = false;
    progress = 0;
  }

  function reset() {
    controller?.abort();
    file = undefined;
    digestBytes = undefined;
    error = undefined;
    elapsed = undefined;
    progress = 0;
    running = false;
  }
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  {#if file === undefined}
    <FileDrop onfile={run} />
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div class="min-w-0">
        <p class="truncate font-mono text-sm text-fg">{file.name}</p>
        <p class="text-xs text-muted">
          {formatBytes(file.size)}{#if elapsed !== undefined}{` · hashed in ${formatDuration(elapsed)}`}{/if}
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

    {#if running}
      <div>
        <div
          class="h-1.5 w-full overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Hashing progress"
        >
          <div
            class="h-full rounded-full bg-accent transition-[width] duration-150"
            style="width: {progress * 100}%"
          ></div>
        </div>
        <p class="mt-1 text-xs text-muted">Reading and hashing… {Math.round(progress * 100)}%</p>
      </div>
    {/if}
  {/if}

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    <Field label="Output encoding" for="output-encoding">
      <Select id="output-encoding" bind:value={outputEncoding} options={OUTPUT_ENCODINGS} />
    </Field>

    {#if meta.dkLen}
      <Field label="Output length" for="output-length">
        <div class="flex items-center gap-2">
          <input
            id="output-length"
            type="number"
            bind:value={dkLen}
            min={meta.dkLen.min}
            max={meta.dkLen.max}
            step="1"
            class="w-24 rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
          <span class="text-xs text-muted">bytes ({describeRange(meta.dkLen)})</span>
        </div>
      </Field>
    {/if}

    {#if meta.key}
      <div class="flex items-end pb-1.5">
        <label class="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            bind:checked={useKey}
            class="size-4 rounded border-border accent-accent"
          />
          Keyed
        </label>
      </div>
    {/if}
  </div>

  {#if useKey && meta.key}
    <div class="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-border bg-surface p-3">
      <div class="min-w-56 flex-1">
        <Field label="Key" for="key">
          <input
            id="key"
            type="text"
            bind:value={keyText}
            spellcheck="false"
            autocomplete="off"
            class="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-sm text-fg
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </Field>
      </div>
      <Field label="Key encoding" for="key-encoding">
        <Select id="key-encoding" bind:value={keyEncoding} options={INPUT_ENCODINGS} />
      </Field>
      <p class="w-full text-xs text-muted">
        Keyed {meta.label} is a MAC, not a checksum: the same file gives a different
        value under a different key. Needs {describeRange(meta.key)} bytes.
      </p>
    </div>
  {/if}

  <OutputArea
    value={digest}
    {error}
    pending={running}
    label={useKey ? `${meta.label} MAC` : `${meta.label} checksum`}
    meta="{digestBits} bits"
  />

  <div class="flex flex-col gap-1.5">
    <label for="expected" class="text-xs font-medium text-muted">
      Compare with a published checksum (optional)
    </label>
    <input
      id="expected"
      type="text"
      bind:value={expected}
      spellcheck="false"
      autocomplete="off"
      placeholder="Paste the expected checksum…"
      class="w-full rounded-md border px-2.5 py-1.5 font-mono text-sm text-fg
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
             {comparison === undefined
               ? 'border-border bg-surface'
               : comparison
                 ? 'border-ok/50 bg-ok/5'
                 : 'border-danger/50 bg-danger/5'}"
    />
    <p class="text-xs" aria-live="polite">
      {#if comparison === true}
        <span class="font-medium text-ok">Match — the file is byte-for-byte what was published.</span>
      {:else if comparison === false}
        <span class="font-medium text-danger">No match — this file differs from the published one.</span>
      {:else}
        <span class="text-muted">Accepts hex or Base64, in any case, with or without a trailing filename.</span>
      {/if}
    </p>
  </div>
</div>
