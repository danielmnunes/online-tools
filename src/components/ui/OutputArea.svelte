<script lang="ts">
  import CopyButton from './CopyButton.svelte';

  interface Props {
    value: string;
    error?: string | undefined;
    pending?: boolean;
    label?: string;
    /** Shown next to the label, e.g. "128 bits". */
    meta?: string | undefined;
  }
  let { value, error, pending = false, label = 'Output', meta }: Props = $props();
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-baseline gap-2">
      <span class="text-xs font-medium text-muted">{label}</span>
      {#if meta}<span class="text-xs text-muted">{meta}</span>{/if}
    </div>
    <CopyButton text={error ? '' : value} />
  </div>

  <output
    aria-live="polite"
    aria-busy={pending}
    class="block min-h-[3.5rem] w-full rounded-lg border px-3 py-2.5 font-mono text-sm
           break-all whitespace-pre-wrap
           {error
             ? 'border-danger/40 bg-danger/5 text-danger'
             : 'border-border bg-surface text-fg'}"
  >{#if error}{error}{:else if pending}<span class="text-muted">Computing…</span
    >{:else if value}{value}{:else}<span class="text-muted">Result appears here.</span>{/if}</output>
</div>
