<script lang="ts">
  import { INPUT_ENCODINGS, textToBytes, type InputEncoding } from '~/lib/encoding';
  import Field from './Field.svelte';
  import Select from './Select.svelte';

  interface Props {
    id: string;
    label: string;
    value: string;
    encoding: InputEncoding;
    placeholder?: string;
    hint?: string;
    /** Called when the "Random" button is used; absent means no button. */
    onrandom?: () => void;
    randomLabel?: string;
  }
  let {
    id,
    label,
    value = $bindable(),
    encoding = $bindable(),
    placeholder,
    hint,
    onrandom,
    randomLabel = 'Random',
  }: Props = $props();

  /**
   * The length the algorithm will see, which is not the length of what was
   * typed: sixteen hex characters are eight bytes, and every one of these
   * fields feeds something with an opinion about size.
   */
  const size = $derived.by(() => {
    try {
      return `${textToBytes(value, encoding).length} bytes`;
    } catch {
      return 'not valid for this encoding';
    }
  });
</script>

<div class="flex flex-wrap items-end gap-x-4 gap-y-2">
  <div class="min-w-48 flex-1">
    <Field {label} for={id}>
      <input
        {id}
        type="text"
        bind:value
        {placeholder}
        spellcheck="false"
        autocomplete="off"
        autocapitalize="off"
        class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
               placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
    </Field>
  </div>

  <Field label="Encoding" for="{id}-encoding">
    <Select id="{id}-encoding" bind:value={encoding} options={INPUT_ENCODINGS} />
  </Field>

  {#if onrandom}
    <button
      type="button"
      onclick={onrandom}
      class="mb-0.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted
             transition-colors hover:bg-surface hover:text-fg
             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {randomLabel}
    </button>
  {/if}

  <p class="w-full text-xs text-muted">
    <!-- The separator is interpolated rather than written as literal text:
         Svelte trims whitespace adjacent to a block, which otherwise eats the
         space before the bullet. -->
    {size}{#if hint}{' · ' + hint}{/if}
  </p>
</div>
