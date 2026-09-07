<script lang="ts">
  import JsonTree from './JsonTree.svelte';
  import CopyButton from './CopyButton.svelte';
  import { untrack } from 'svelte';
  import type { JsonTreeNode } from '~/lib/json';

  interface Props {
    node: JsonTreeNode;
    keyName?: string;
    path?: string;
    depth?: number;
  }
  let { node, keyName, path = '$', depth = 0 }: Props = $props();

  let open = $state(untrack(() => depth < 2));

  const expandable = $derived(node.type === 'object' || node.type === 'array');
  const count = $derived(node.length ?? 0);
  const summary = $derived(
    node.type === 'object' ? `{${count}}` : node.type === 'array' ? `[${count}]` : '',
  );

  function display(value: string | number | boolean | null | undefined): string {
    if (node.type === 'string') return JSON.stringify(value);
    if (node.type === 'null') return 'null';
    return String(value);
  }
</script>

<div class="font-mono text-sm">
  {#if expandable}
    <div class="flex items-start gap-1">
      <button
        type="button"
        class="mt-0.5 size-5 shrink-0 rounded text-muted hover:bg-surface hover:text-fg
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        aria-expanded={open}
        onclick={() => (open = !open)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span class="sr-only">{open ? 'Collapse' : 'Expand'} {path}</span>
      </button>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-baseline gap-x-2">
          {#if keyName !== undefined}
            <span class="text-accent">{JSON.stringify(keyName)}</span>
            <span class="text-muted">:</span>
          {/if}
          <span class="text-muted">{node.type === 'object' ? '{' : '['}</span>
          {#if !open}
            <span class="text-muted">{summary}</span>
            <span class="text-muted">{node.type === 'object' ? '}' : ']'}</span>
          {/if}
          <span class="text-xs text-muted">{count} {count === 1 ? 'item' : 'items'}</span>
        </div>
        {#if open}
          <ul class="ml-2 border-l border-border pl-3">
            {#each node.children ?? [] as child (child.key)}
              <li class="py-0.5">
                <JsonTree
                  node={child.node}
                  keyName={node.type === 'object' ? child.key : undefined}
                  path={node.type === 'array' ? `${path}[${child.key}]` : `${path}.${child.key}`}
                  depth={depth + 1}
                />
              </li>
            {/each}
          </ul>
          <span class="text-muted">{node.type === 'object' ? '}' : ']'}</span>
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex flex-wrap items-baseline gap-x-2">
      {#if keyName !== undefined}
        <span class="text-accent">{JSON.stringify(keyName)}</span>
        <span class="text-muted">:</span>
      {/if}
      <span
        class={node.type === 'string'
          ? 'text-ok break-all'
          : node.type === 'number' || node.type === 'boolean'
            ? 'text-accent'
            : 'text-muted'}
      >{display(node.value)}</span>
      {#if node.type === 'string' && typeof node.value === 'string' && node.value.length > 0}
        <CopyButton text={node.value} label="Copy value" />
      {/if}
    </div>
  {/if}
</div>
