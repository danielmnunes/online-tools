<script lang="ts">
  interface Props {
    text: string;
    label?: string;
  }
  let { text, label = 'Copy' }: Props = $props();

  let state: 'idle' | 'copied' | 'failed' = $state('idle');
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function copy() {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(text);
      state = 'copied';
    } catch {
      // Clipboard access can be denied (insecure context, permissions).
      // Say so rather than silently doing nothing.
      state = 'failed';
    }
    timer = setTimeout(() => (state = 'idle'), 1800);
  }
</script>

<button
  type="button"
  onclick={copy}
  disabled={text.length === 0}
  class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
         transition-colors hover:bg-surface hover:text-fg
         disabled:cursor-not-allowed disabled:opacity-40
         focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
>
  {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
</button>
<span aria-live="polite" class="sr-only">
  {state === 'copied' ? 'Copied to clipboard' : state === 'failed' ? 'Copy failed' : ''}
</span>
