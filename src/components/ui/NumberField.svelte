<script lang="ts">
  import Field from './Field.svelte';

  interface Props {
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    /** Shown to the right of the box: "bytes", "KiB". */
    unit?: string;
    hint?: string;
    /** Width class for the box; wide numbers like 600000 need more room. */
    width?: string;
  }
  let { id, label, value = $bindable(), min, max, unit, hint, width = 'w-28' }: Props = $props();
</script>

<Field {label} for={id}>
  <div class="flex items-center gap-2">
    <input
      {id}
      type="number"
      bind:value
      {min}
      {max}
      step="1"
      inputmode="numeric"
      class="{width} rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    />
    {#if unit}<span class="text-xs text-muted">{unit}</span>{/if}
  </div>
  {#if hint}
    <p class="max-w-72 text-xs text-muted">{hint}</p>
  {/if}
</Field>
