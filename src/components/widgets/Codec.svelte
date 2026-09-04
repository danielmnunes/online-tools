<script lang="ts">
  import { untrack } from 'svelte';
  import { CODECS, type CodecDirection, type CodecId } from '~/lib/algo/codecs';
  import { decodeText, defaultOptions, encodeBytes, type CodecOptions } from '~/lib/codec';
  import {
    DISPLAY_ENCODINGS,
    INPUT_ENCODINGS,
    bytesToDisplayText,
    textToBytes,
    type DisplayEncoding,
    type InputEncoding,
  } from '~/lib/encoding';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';

  interface Props {
    codec: CodecId;
    direction: CodecDirection;
  }
  let { codec, direction }: Props = $props();

  const meta = $derived(CODECS[codec]);
  const page = $derived(direction === 'encode' ? meta.encode : meta.decode);

  let input = $state('');
  let inputEncoding = $state<InputEncoding>('utf-8');
  let outputEncoding = $state<DisplayEncoding>('utf-8');

  // untrack because capturing the initial value is the intent: one page is one
  // codec, so neither prop changes for a mounted island.
  let options = $state<Record<string, string>>(untrack(() => defaultOptions(codec)));

  let output = $state('');
  let error = $state<string | undefined>(undefined);
  let pending = $state(false);
  let resultBytes = $state(0);

  /** Guards against a slow earlier run landing after a faster later one. */
  let runId = 0;

  async function compute() {
    const id = ++runId;
    error = undefined;
    // Base58Check loads SHA-256 on demand, so there is a real await to cover.
    pending = true;

    // Both directions announce what they consumed, which is the number a
    // person comparing against another tool actually wants.
    try {
      if (direction === 'encode') {
        const bytes = textToBytes(input, inputEncoding);
        const text = await encodeBytes(codec, bytes, options);
        if (id !== runId) return;
        output = text;
        resultBytes = bytes.length;
      } else {
        const bytes = await decodeText(codec, input, options);
        if (id !== runId) return;
        output = bytesToDisplayText(bytes, outputEncoding);
        resultBytes = bytes.length;
      }
    } catch (e) {
      if (id !== runId) return;
      output = '';
      resultBytes = 0;
      error = e instanceof Error ? e.message : 'That could not be converted.';
    } finally {
      if (id === runId) pending = false;
    }
  }

  // Reading the state up front makes the dependency set explicit rather than
  // relying on what compute() happens to touch before its first await.
  $effect(() => {
    void input;
    void inputEncoding;
    void outputEncoding;
    void options;
    void compute();
  });

  /**
   * Feed the result back in, which is how a round trip gets checked.
   *
   * Each page has one encoding switch, and it has to go back to text: what is
   * being fed in is characters somebody typed, not the bytes they came from.
   */
  function reuse() {
    input = output;
    if (direction === 'encode') inputEncoding = 'utf-8';
    else outputEncoding = 'utf-8';
  }

  const sizeNote = $derived(
    direction === 'encode'
      ? `${resultBytes} byte${resultBytes === 1 ? '' : 's'} in`
      : `${resultBytes} byte${resultBytes === 1 ? '' : 's'} out`,
  );
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <label for="codec-input" class="text-xs font-medium text-muted">
        {direction === 'encode' ? 'Text or bytes to encode' : `${meta.label} to decode`}
      </label>
      {#if output !== '' && error === undefined}
        <button
          type="button"
          onclick={reuse}
          class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
                 transition-colors hover:bg-surface hover:text-fg
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >Use the result as input</button>
      {/if}
    </div>
    <textarea
      id="codec-input"
      bind:value={input}
      rows="5"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      aria-describedby="codec-input-note"
      placeholder={direction === 'encode'
        ? 'Type or paste your text here…'
        : `Paste ${meta.label} here…`}
      class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
             font-mono text-sm text-fg placeholder:text-muted
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    ></textarea>
    <p id="codec-input-note" class="text-xs text-muted">
      {#if direction === 'encode'}
        Nothing is uploaded. Set the input encoding to Hex or Base64 to encode bytes you already
        have rather than the characters you typed.
      {:else}
        Whitespace and line breaks are ignored, so a wrapped or quoted blob decodes as it stands.
      {/if}
    </p>
  </div>

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    {#if direction === 'encode'}
      <Field label="Input encoding" for="input-encoding">
        <Select id="input-encoding" bind:value={inputEncoding} options={INPUT_ENCODINGS} />
      </Field>
    {:else}
      <Field label="Show the result as" for="output-encoding">
        <Select id="output-encoding" bind:value={outputEncoding} options={DISPLAY_ENCODINGS} />
      </Field>
    {/if}

    {#each meta.controls.filter((control) => control.appliesTo === 'both' || control.appliesTo === direction) as control (control.id)}
      <Field label={control.label} for="codec-{control.id}" hint={control.hint}>
        <Select
          id="codec-{control.id}"
          bind:value={options[control.id]}
          options={control.options}
        />
      </Field>
    {/each}
  </div>

  <OutputArea
    value={output}
    {error}
    {pending}
    label={page.name}
    meta={error === undefined && output !== '' ? sizeNote : undefined}
  />

  <p class="text-xs text-muted">{meta.blurb}</p>
</div>
