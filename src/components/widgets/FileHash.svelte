<script lang="ts">
  import { HASHES, type HashId } from '~/lib/algo/hashes';
  import { hashBlob } from '~/lib/algo/hash';
  import { OUTPUT_ENCODINGS, bytesToText, type OutputEncoding } from '~/lib/encoding';
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

  let controller: AbortController | undefined;

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
          {formatBytes(file.size)}{#if elapsed !== undefined} · hashed in {formatDuration(elapsed)}{/if}
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

  <Field label="Output encoding" for="output-encoding">
    <Select id="output-encoding" bind:value={outputEncoding} options={OUTPUT_ENCODINGS} />
  </Field>

  <OutputArea
    value={digest}
    {error}
    pending={running}
    label="{meta.label} checksum"
    meta="{meta.bits} bits"
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
