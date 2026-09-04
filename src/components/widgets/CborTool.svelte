<script lang="ts">
  import { decodeCbor, encodeCbor, type CborEncoding } from '~/lib/cbor';
  import { formatBytes } from '~/lib/format';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';

  type Mode = 'decode' | 'encode';

  let mode = $state<Mode>('decode');

  let encodedInput = $state('');
  let inputEncoding = $state<CborEncoding>('hex');
  let jsonInput = $state('{\n  "hello": "world"\n}');
  let deterministic = $state(false);

  const ENCODINGS = [
    { value: 'hex', label: 'Hex' },
    { value: 'base64', label: 'Base64' },
  ];

  /**
   * Computed rather than stored: every field of the result comes from one
   * parse, so there is no way for the three views to disagree with each other.
   */
  const result = $derived.by(() => {
    if (mode === 'decode') {
      if (encodedInput.trim() === '') return undefined;
      try {
        return { ok: true as const, view: decodeCbor(encodedInput, inputEncoding) };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
      }
    }
    if (jsonInput.trim() === '') return undefined;
    try {
      return { ok: true as const, view: encodeCbor(jsonInput, { deterministic }) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

  /**
   * How the sizes compare, which is the reason to reach for CBOR at all.
   *
   * The JSON side is the compact form in both directions: pretty-printing adds
   * whitespace that no wire format would carry, and comparing against it would
   * flatter CBOR for no reason.
   */
  const saved = $derived.by(() => {
    const view = result?.ok === true ? result.view : undefined;
    if (view === undefined) return undefined;
    const jsonBytes =
      'jsonSize' in view
        ? view.jsonSize
        : new TextEncoder().encode(JSON.stringify(JSON.parse(view.json))).length;
    const difference = jsonBytes - view.bytes.length;
    if (difference === 0) return 'the same size as the JSON';
    const size = Math.abs(difference);
    // CBOR is not always the smaller one: a float64 for a small value, an
    // indefinite-length item, or a tag that the JSON view flattens can all
    // make the binary form the larger of the two.
    return `${size} byte${size === 1 ? '' : 's'} ${difference > 0 ? 'smaller' : 'larger'} than the same data as JSON`;
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <div class="flex gap-1 rounded-lg border border-border bg-surface p-1" role="group" aria-label="Direction">
    {#each [{ value: 'decode', label: 'Decode CBOR' }, { value: 'encode', label: 'Encode JSON' }] as const as option (option.value)}
      <button
        type="button"
        onclick={() => (mode = option.value)}
        aria-pressed={mode === option.value}
        class="flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent
               {mode === option.value ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-bg hover:text-fg'}"
      >{option.label}</button>
    {/each}
  </div>

  {#if mode === 'decode'}
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <label for="cbor-input" class="text-xs font-medium text-muted">CBOR</label>
      </div>
      <textarea
        id="cbor-input"
        bind:value={encodedInput}
        rows="4"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder="a26161016162820203"
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
    </div>

    <Field label="Input encoding" for="cbor-encoding">
      <Select id="cbor-encoding" bind:value={inputEncoding} options={ENCODINGS} />
    </Field>
  {:else}
    <div class="flex flex-col gap-1.5">
      <label for="json-input" class="text-xs font-medium text-muted">JSON</label>
      <textarea
        id="json-input"
        bind:value={jsonInput}
        rows="6"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
      <label class="flex items-center gap-2 text-xs font-medium text-muted">
        <input
          type="checkbox"
          bind:checked={deterministic}
          class="size-4 rounded border-border accent-accent"
        />
        Sort map keys, so the same data always gives the same bytes
      </label>
    </div>
  {/if}

  {#if result !== undefined && !result.ok}
    <p
      class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 font-mono text-sm text-danger"
      role="alert"
    >{result.error}</p>
  {/if}

  {#if result?.ok === true}
    {@const view = result.view}
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted">
          {mode === 'encode' ? 'CBOR (hex)' : 'Diagnostic notation'}
        </span>
        <CopyButton text={mode === 'encode' ? (view as { hex: string }).hex : view.diagnostic} />
      </div>
      <pre
        aria-live="polite"
        aria-label={mode === 'encode' ? 'The CBOR bytes, in hex' : 'Diagnostic notation'}
        class="max-h-72 overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg whitespace-pre-wrap break-all"
      >{mode === 'encode' ? (view as { hex: string }).hex : view.diagnostic}</pre>
      <p class="text-xs text-muted">
        {view.bytes.length} byte{view.bytes.length === 1 ? '' : 's'} ({formatBytes(view.bytes.length)}){#if saved !== undefined}{`, ${saved}`}{/if}.
      </p>
    </div>

    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted">JSON</span>
        <CopyButton text={view.json} />
      </div>
      <pre
        aria-label="The same item as JSON"
        class="max-h-72 overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-xs text-fg whitespace-pre-wrap break-all"
      >{view.json}</pre>
      <p class="text-xs text-muted">
        Integers too wide for JSON are written as strings, and byte strings as hex: neither survives
        a round trip through JSON, which is the whole reason CBOR exists.
      </p>
    </div>

    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted">Byte by byte</span>
        <CopyButton text={view.annotated} />
      </div>
      <pre
        aria-label="Byte by byte"
        class="max-h-72 overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-xs text-fg whitespace-pre"
      >{view.annotated}</pre>
    </div>
  {/if}
</div>
