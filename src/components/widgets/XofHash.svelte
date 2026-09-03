<script lang="ts">
  import { untrack } from 'svelte';
  import { XOFS, type XofId } from '~/lib/algo/xofs';
  import { xofBytes, type XofParams } from '~/lib/algo/xof';
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
  import NumberField from '~/components/ui/NumberField.svelte';
  import BytesInput from '~/components/ui/BytesInput.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';

  interface Props {
    algorithm: XofId;
  }
  let { algorithm }: Props = $props();

  const meta = $derived(XOFS[algorithm]);

  let inputEncoding = $state<InputEncoding>('utf-8');
  let outputEncoding = $state<OutputEncoding>('hex');

  /**
   * TupleHash takes an ordered list of strings rather than one, so the input
   * is always an array; every other function simply uses the first element.
   * Modelling it this way avoids a second code path for one algorithm.
   */
  let parts = $state<string[]>(['']);

  let key = $state('');
  let keyEncoding = $state<InputEncoding>('utf-8');
  let customization = $state('');
  let customizationEncoding = $state<InputEncoding>('utf-8');
  let functionName = $state('');
  let functionNameEncoding = $state<InputEncoding>('utf-8');

  // untrack because capturing the initial value is the intent: one page is one
  // function, so `algorithm` never changes for a mounted island.
  let dkLen = $state(untrack(() => XOFS[algorithm].defaultLen));
  let blockLen = $state(untrack(() => XOFS[algorithm].blockLen?.default ?? 8));

  let digest = $state('');
  let error = $state<string | undefined>(undefined);
  let pending = $state(false);

  /** Guards against a slow earlier run landing after a faster later one. */
  let runId = 0;

  function addPart() {
    parts = [...parts, ''];
  }

  function removePart(index: number) {
    parts = parts.filter((_, i) => i !== index);
    if (parts.length === 0) parts = [''];
  }

  async function compute() {
    const id = ++runId;
    error = undefined;

    let messages: Uint8Array[];
    const params: XofParams = { dkLen };
    try {
      messages = (meta.tuple ? parts : parts.slice(0, 1)).map((part) =>
        textToBytes(part, inputEncoding),
      );
      if (meta.key === 'required') params.key = textToBytes(key, keyEncoding);
      if (meta.customization && customization !== '') {
        params.customization = textToBytes(customization, customizationEncoding);
      }
      if (meta.functionName && functionName !== '') {
        params.functionName = textToBytes(functionName, functionNameEncoding);
      }
      if (meta.blockLen) params.blockLen = blockLen;
    } catch (e) {
      digest = '';
      error = e instanceof Error ? e.message : String(e);
      return;
    }

    pending = true;
    try {
      const out = await xofBytes(algorithm, messages, params);
      if (id !== runId) return;
      digest = bytesToText(out, outputEncoding);
    } catch (e) {
      if (id !== runId) return;
      digest = '';
      error = e instanceof Error ? e.message : 'Computation failed.';
    } finally {
      if (id === runId) pending = false;
    }
  }

  // Reading the state up front makes the dependency set explicit rather than
  // relying on what compute() happens to touch before its first await.
  $effect(() => {
    void parts;
    void inputEncoding;
    void outputEncoding;
    void key;
    void keyEncoding;
    void customization;
    void customizationEncoding;
    void functionName;
    void functionNameEncoding;
    void dkLen;
    void blockLen;
    void compute();
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  {#if meta.tuple}
    <div class="flex flex-col gap-2">
      <span class="text-xs font-medium text-muted">Tuple elements, in order</span>
      {#each parts as _, index (index)}
        <div class="flex items-center gap-2">
          <span class="w-6 shrink-0 text-right font-mono text-xs text-muted">{index + 1}</span>
          <input
            type="text"
            bind:value={parts[index]}
            spellcheck="false"
            autocomplete="off"
            aria-label="Tuple element {index + 1}"
            class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
          <button
            type="button"
            onclick={() => removePart(index)}
            disabled={parts.length === 1}
            aria-label="Remove element {index + 1}"
            class="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs text-muted
                   hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >Remove</button>
        </div>
      {/each}
      <div>
        <button
          type="button"
          onclick={addPart}
          class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
                 hover:bg-surface hover:text-fg
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >Add element</button>
      </div>
      <p class="text-xs text-muted">
        The boundaries are part of the input: ["ab", "cd"] and ["a", "bcd"] hash differently.
      </p>
    </div>
  {:else}
    <Field label="Input" for="input">
      <textarea
        id="input"
        bind:value={parts[0]}
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
  {/if}

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    <Field label="Input encoding" for="input-encoding">
      <Select id="input-encoding" bind:value={inputEncoding} options={INPUT_ENCODINGS} />
    </Field>
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
        ? 'Squeezed from the sponge: a shorter output is the prefix of a longer one.'
        : 'Part of the input: asking for a different length gives an unrelated value.'}
    />
    {#if meta.blockLen}
      <NumberField
        id="block-length"
        label="Block size B"
        bind:value={blockLen}
        min={meta.blockLen.min}
        max={meta.blockLen.max}
        unit="bytes"
        hint="Also part of the input. B = 8 is what the NIST examples use."
      />
    {/if}
  </div>

  {#if meta.key === 'required' || meta.customization || meta.functionName}
    <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      {#if meta.key === 'required'}
        <BytesInput
          id="key"
          label="Key"
          bind:value={key}
          bind:encoding={keyEncoding}
          placeholder="The MAC key"
          hint="SP 800-185 recommends at least {meta.strength / 8} bytes, matching the security strength."
        />
      {/if}

      {#if meta.functionName}
        <BytesInput
          id="function-name"
          label="Function name N (optional)"
          bind:value={functionName}
          bind:encoding={functionNameEncoding}
          hint="Reserved by NIST for standardised functions. Leave it empty unless you are implementing one."
        />
      {/if}

      {#if meta.customization}
        <BytesInput
          id="customization"
          label="Customization string S (optional)"
          bind:value={customization}
          bind:encoding={customizationEncoding}
          placeholder="e.g. Email Signature"
          hint="Domain separation: the same input under a different S gives an unrelated digest."
        />
      {/if}

      {#if meta.family === 'cshake' && functionName === '' && customization === ''}
        <p class="text-xs text-muted">
          With both strings empty, SP 800-185 defines {meta.label} to be plain SHAKE{meta.strength}
          — which is what this is currently computing.
        </p>
      {/if}
    </div>
  {/if}

  <OutputArea
    value={digest}
    {error}
    {pending}
    label={meta.label}
    meta="{dkLen} bytes"
  />
</div>
