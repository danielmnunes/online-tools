<script lang="ts">
  import type { DiffResult } from '~/lib/diff';

  interface Props {
    diff: DiffResult;
  }
  let { diff }: Props = $props();
</script>

<div class="flex flex-col gap-1.5">
  <p class="text-xs text-muted">
    {diff.added} added, {diff.removed} removed
    {#if diff.added === 0 && diff.removed === 0}
      — the two sides are identical
    {/if}
  </p>
  <div
    role="table"
    aria-label="Line-by-line diff"
    class="max-h-[32rem] overflow-auto rounded-lg border border-border font-mono text-xs"
  >
    {#each diff.lines as line, index (index)}
      <div
        role="row"
        class="grid grid-cols-[3.5rem_3.5rem_1.5rem_1fr] gap-0
               {line.kind === 'add'
                 ? 'bg-ok/10 text-ok'
                 : line.kind === 'remove'
                   ? 'bg-danger/10 text-danger'
                   : 'text-fg'}"
      >
        <span role="cell" class="select-none px-2 py-0.5 text-right text-muted tabular-nums">
          {line.leftLine ?? ''}
        </span>
        <span role="cell" class="select-none px-2 py-0.5 text-right text-muted tabular-nums">
          {line.rightLine ?? ''}
        </span>
        <span role="cell" class="select-none py-0.5 text-center" aria-label={line.kind}>
          {line.kind === 'add' ? '+' : line.kind === 'remove' ? '−' : ' '}
        </span>
        <span role="cell" class="whitespace-pre-wrap break-all px-2 py-0.5">
          {line.text === '' ? ' ' : line.text}
        </span>
      </div>
    {/each}
  </div>
</div>
