<script lang="ts">
  import { untrack } from 'svelte';
  import { XOFS, type XofId } from '~/lib/algo/xofs';
  import { xofBlob, type XofParams } from '~/lib/algo/xof';
  import {
    OUTPUT_ENCODINGS,
    bytesToText,
    textToBytes,
    type InputEncoding,
    type OutputEncoding,
  } from '~/lib/encoding';
  import { formatBytes, formatDuration } from '~/lib/format';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import NumberField from '~/components/ui/NumberField.svelte';
  import BytesInput from '~/components/ui/BytesInput.svelte';
  import FileDrop from '~/components/ui/FileDrop.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';

  interface Props {
    algorithm: XofId;
  }
  let { algorithm }: Props = $props();

  const meta = $derived(XOFS[algorithm]);

  let file = $state<File | undefined>(undefined);
  let outputEncoding = $state<OutputEncoding>('hex');
  let digestBytes = $state<Uint8Array | undefined>(undefined);
  let error = $state<string | undefined>(undefined);
  let progress = $state(0);
  let running = $state(false);
  let elapsed = $state<number | undefined>(undefined);
  let expected = $state('');

  let key = $state('');
  let keyEncoding = $state<InputEncoding>('utf-8');
  let customization = $state('');
  let customizationEncoding = $state<InputEncoding>('utf-8');
  let functionName = $state('');
  let functionNameEncoding = $state<InputEncoding>('utf-8');
  let dkLen = $state(untrack(() => XOFS[algorithm].defaultLen));

  let controller: AbortController | undefined;

  /** Throws if a field does not decode, which run() reports like any error. */
  function params(): XofParams {
    const out: XofParams = { dkLen };
    if (meta.key === 'required') out.key = textToBytes(key, keyEncoding);
    if (meta.customization && customization !== '') {
      out.customization = textToBytes(customization, customizationEncoding);
    }
    if (meta.functionName && functionName !== '') {
      out.functionName = textToBytes(functionName, functionNameEncoding);
    }
    return out;
  }

  const digest = $derived(digestBytes ? bytesToText(digestBytes, outputEncoding) : '');

  /** Normalised on both sides, and against every output form we can render. */
  const comparison = $derived.by(() => {
    const candidate = expected.trim().split(/\s+/)[0] ?? '';
    if (candidate === '' || digestBytes === undefined) return undefined;
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
      const out = await xofBlob(algorithm, selected, {
        ...params(),
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

  // Any parameter change makes the digest on screen wrong, so recompute rather
  // than leaving a stale value beside the new settings. `file` is read
  // untracked: choosing a file already calls run() through the drop target.
  $effect(() => {
    void key;
    void keyEncoding;
    void customization;
    void customizationEncoding;
    void functionName;
    void functionNameEncoding;
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
    <NumberField
      id="output-length"
      label="Output length"
      bind:value={dkLen}
      min={meta.dkLen.min}
      max={meta.dkLen.max}
      unit="bytes"
      hint={meta.squeezes
        ? 'A shorter output is the prefix of a longer one.'
        : 'Part of the input: a different length is a different value.'}
    />
  </div>

  {#if meta.key === 'required' || meta.customization || meta.functionName}
    <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      {#if meta.key === 'required'}
        <BytesInput
          id="key"
          label="Key"
          bind:value={key}
          bind:encoding={keyEncoding}
          hint="Keyed {meta.label} is a MAC, not a checksum: the same file under a different key gives a different value."
        />
      {/if}
      {#if meta.functionName}
        <BytesInput
          id="function-name"
          label="Function name N (optional)"
          bind:value={functionName}
          bind:encoding={functionNameEncoding}
          hint="Reserved by NIST for standardised functions."
        />
      {/if}
      {#if meta.customization}
        <BytesInput
          id="customization"
          label="Customization string S (optional)"
          bind:value={customization}
          bind:encoding={customizationEncoding}
          hint="Domain separation, mixed in before the file's bytes."
        />
      {/if}
    </div>
  {/if}

  <OutputArea
    value={digest}
    {error}
    pending={running}
    label="{meta.label} of the file"
    meta="{dkLen} bytes"
  />

  <div class="flex flex-col gap-1.5">
    <label for="expected" class="text-xs font-medium text-muted">
      Compare with a published value (optional)
    </label>
    <input
      id="expected"
      type="text"
      bind:value={expected}
      spellcheck="false"
      autocomplete="off"
      placeholder="Paste the expected value…"
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
        <span class="font-medium text-danger">No match — this file differs, or the parameters do.</span>
      {:else}
        <span class="text-muted">
          Accepts hex or Base64, in any case, with or without a trailing filename. The output length
          and any customization string must match what produced the published value.
        </span>
      {/if}
    </p>
  </div>
</div>
