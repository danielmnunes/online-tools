<script lang="ts">
  import { untrack } from 'svelte';
  import { HASHES, defaultDkLen, describeRange, type HashId } from '~/lib/algo/hashes';
  import { hashBytes, type HashParams } from '~/lib/algo/hash';
  import {
    INPUT_ENCODINGS,
    OUTPUT_ENCODINGS,
    bytesToText,
    textToBytes,
    type InputEncoding,
    type OutputEncoding,
  } from '~/lib/encoding';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';

  interface Props {
    algorithm: HashId;
  }
  let { algorithm }: Props = $props();

  const meta = $derived(HASHES[algorithm]);

  /**
   * Two different ways of keying a hash, presented as one control.
   *
   * Most algorithms here are keyed through HMAC. The BLAKE family takes a key
   * directly, which is a different construction producing a different value --
   * so the widget asks for a key the same way but hands it to whichever
   * primitive the algorithm actually declares.
   */
  const keyKind = $derived(meta.hmac ? 'hmac' : meta.key ? 'native' : undefined);
  const keyFieldLabel = $derived(meta.hmac ? 'HMAC key' : 'Key');

  let input = $state('');
  let inputEncoding = $state<InputEncoding>('utf-8');
  let outputEncoding = $state<OutputEncoding>('hex');
  let useKey = $state(false);
  let keyText = $state('');
  let keyEncoding = $state<InputEncoding>('utf-8');
  // untrack because capturing the initial value is the intent: one page is
  // one algorithm, so `algorithm` never changes for a mounted island.
  let dkLen = $state(untrack(() => defaultDkLen(algorithm)));

  /** Key size as the algorithm will see it, for the hint under the field. */
  const keyBytes = $derived.by(() => {
    try {
      return textToBytes(keyText, keyEncoding).length;
    } catch {
      return undefined;
    }
  });

  const digestBits = $derived((meta.dkLen ? dkLen : meta.bits / 8) * 8);

  let digest = $state('');
  let error = $state<string | undefined>(undefined);
  let pending = $state(false);

  /**
   * Guards against out-of-order results: WASM loads and hashing are async, so
   * a slow first run can otherwise land after a faster later one and overwrite
   * the current answer with a stale digest.
   */
  let runId = 0;

  async function compute() {
    const id = ++runId;
    error = undefined;

    let bytes: Uint8Array;
    const params: HashParams = {};
    try {
      bytes = textToBytes(input, inputEncoding);
      if (useKey && keyKind !== undefined) {
        const key = textToBytes(keyText, keyEncoding);
        if (keyKind === 'hmac') params.hmacKey = key;
        else params.key = key;
      }
      if (meta.dkLen) params.dkLen = dkLen;
    } catch (e) {
      digest = '';
      error = e instanceof Error ? e.message : String(e);
      return;
    }

    pending = true;
    try {
      const out = await hashBytes(algorithm, bytes, params);
      if (id !== runId) return;
      digest = bytesToText(out, outputEncoding);
    } catch (e) {
      if (id !== runId) return;
      digest = '';
      error = e instanceof Error ? e.message : 'Hashing failed.';
    } finally {
      if (id === runId) pending = false;
    }
  }

  // Recompute whenever any input changes. Reading the state up front makes the
  // dependency set explicit rather than relying on what compute() happens to
  // touch before its first await.
  $effect(() => {
    void input;
    void inputEncoding;
    void outputEncoding;
    void useKey;
    void keyText;
    void keyEncoding;
    void dkLen;
    void compute();
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <Field label="Input" for="input">
    <textarea
      id="input"
      bind:value={input}
      rows="5"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder="Type or paste your text here…"
      class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
             font-mono text-sm text-fg placeholder:text-muted
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    ></textarea>
  </Field>

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    <Field label="Input encoding" for="input-encoding">
      <Select id="input-encoding" bind:value={inputEncoding} options={INPUT_ENCODINGS} />
    </Field>
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

    {#if keyKind}
      <div class="flex items-end pb-1.5">
        <label class="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            bind:checked={useKey}
            class="size-4 rounded border-border accent-accent"
          />
          {meta.hmac ? 'HMAC' : 'Keyed'}
        </label>
      </div>
    {/if}
  </div>

  {#if useKey && keyKind}
    <div class="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-border bg-surface p-3">
      <div class="min-w-56 flex-1">
        <Field label={keyFieldLabel} for="key">
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
      {#if meta.key}
        <p class="w-full text-xs text-muted">
          {meta.label} takes the key directly rather than through HMAC, and needs
          {describeRange(meta.key)} bytes{#if keyBytes !== undefined} — currently {keyBytes}{/if}.
        </p>
      {/if}
    </div>
  {/if}

  <OutputArea
    value={digest}
    {error}
    {pending}
    label={useKey ? (meta.hmac ? `HMAC-${meta.label}` : `${meta.label} (keyed)`) : meta.label}
    meta="{digestBits} bits"
  />
</div>
