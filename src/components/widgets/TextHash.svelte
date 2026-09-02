<script lang="ts">
  import { HASHES, type HashId } from '~/lib/algo/hashes';
  import { hashBytes } from '~/lib/algo/hash';
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

  let input = $state('');
  let inputEncoding = $state<InputEncoding>('utf-8');
  let outputEncoding = $state<OutputEncoding>('hex');
  let useHmac = $state(false);
  let hmacKey = $state('');
  let hmacKeyEncoding = $state<InputEncoding>('utf-8');

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
    let keyBytes: Uint8Array | undefined;
    try {
      bytes = textToBytes(input, inputEncoding);
      keyBytes = useHmac ? textToBytes(hmacKey, hmacKeyEncoding) : undefined;
    } catch (e) {
      digest = '';
      error = e instanceof Error ? e.message : String(e);
      return;
    }

    pending = true;
    try {
      const out = await hashBytes(algorithm, bytes, keyBytes);
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
    void useHmac;
    void hmacKey;
    void hmacKeyEncoding;
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

    {#if meta.hmac}
      <div class="flex items-end pb-1.5">
        <label class="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            bind:checked={useHmac}
            class="size-4 rounded border-border accent-accent"
          />
          HMAC
        </label>
      </div>
    {/if}
  </div>

  {#if useHmac}
    <div class="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-border bg-surface p-3">
      <div class="min-w-56 flex-1">
        <Field label="HMAC key" for="hmac-key">
          <input
            id="hmac-key"
            type="text"
            bind:value={hmacKey}
            spellcheck="false"
            autocomplete="off"
            class="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-sm text-fg
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </Field>
      </div>
      <Field label="Key encoding" for="hmac-key-encoding">
        <Select id="hmac-key-encoding" bind:value={hmacKeyEncoding} options={INPUT_ENCODINGS} />
      </Field>
    </div>
  {/if}

  <OutputArea
    value={digest}
    {error}
    {pending}
    label={useHmac ? `HMAC-${meta.label}` : meta.label}
    meta="{meta.bits} bits"
  />
</div>
