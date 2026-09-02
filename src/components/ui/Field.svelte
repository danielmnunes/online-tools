<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    label: string;
    /** Must match the id of the control rendered in the children snippet. */
    for: string;
    hint?: string;
    children: Snippet;
  }
  let { label, for: htmlFor, hint, children }: Props = $props();
</script>

<div class="flex flex-col gap-1">
  <label for={htmlFor} class="text-xs font-medium text-muted">{label}</label>
  {@render children()}
  {#if hint}
    <p class="text-xs text-muted">{hint}</p>
  {/if}
</div>
