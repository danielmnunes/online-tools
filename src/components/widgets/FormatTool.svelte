<script lang="ts">
  import { untrack } from 'svelte';
  import {
    FORMATS,
    defaultFormatOptions,
    type FormatId,
  } from '~/lib/algo/formats';
  import {
    diffJson,
    formatJson,
    indentFromOption,
    jsonTree,
    minifyJson,
    parseJson,
    previewJson,
    type JsonDiff,
    type JsonTreeNode,
  } from '~/lib/json';
  import { formatXml, minifyXml, validateXml } from '~/lib/xml';
  import { diffLines, type DiffResult } from '~/lib/diff';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';
  import JsonTree from '~/components/ui/JsonTree.svelte';
  import DiffView from '~/components/ui/DiffView.svelte';

  interface Props {
    id: FormatId;
  }
  let { id }: Props = $props();

  const meta = $derived(FORMATS[id]);

  let input = $state('');
  let inputB = $state('');
  let options = $state<Record<string, string>>(untrack(() => defaultFormatOptions(id)));

  type HighlightView = { html: string; language: string; detected: boolean };
  type RepairView = { formatted: string; alreadyValid: boolean };

  let highlightView = $state<HighlightView | undefined>(undefined);
  let highlightError = $state<string | undefined>(undefined);
  let repairView = $state<RepairView | undefined>(undefined);
  let repairError = $state<string | undefined>(undefined);

  const optionValues = $derived.by(() => {
    const out: Record<string, string> = {};
    for (const control of meta.controls) out[control.id] = options[control.id] ?? control.default;
    return out;
  });

  const inputLabel = $derived(
    meta.kind === 'highlight' ? 'Code' : meta.kind === 'compare' ? 'Left' : meta.family === 'xml' ? 'XML' : 'JSON',
  );

  $effect(() => {
    const chunk = meta.chunk;
    const text = input;
    for (const control of meta.controls) void options[control.id];
    void optionValues;

    if (chunk !== 'highlight') {
      highlightView = undefined;
      highlightError = undefined;
    }
    if (chunk !== 'repair') {
      repairView = undefined;
      repairError = undefined;
    }

    if (chunk === 'highlight') {
      if (text === '') {
        highlightView = undefined;
        highlightError = undefined;
        return;
      }
      const language = optionValues.language ?? 'auto';
      let cancelled = false;
      void import('~/lib/highlight').then(({ highlightCode }) => {
        if (cancelled) return;
        try {
          highlightView = highlightCode(text, language);
          highlightError = undefined;
        } catch (error) {
          highlightView = undefined;
          highlightError = error instanceof Error ? error.message : String(error);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    if (chunk === 'repair') {
      if (text.trim() === '') {
        repairView = undefined;
        repairError = undefined;
        return;
      }
      const indent = indentFromOption(optionValues.indent ?? '2');
      let cancelled = false;
      void import('~/lib/json-repair').then(({ repairJson }) => {
        if (cancelled) return;
        try {
          const result = repairJson(text, indent);
          repairView = { formatted: result.formatted, alreadyValid: result.alreadyValid };
          repairError = undefined;
        } catch (error) {
          repairView = undefined;
          repairError = error instanceof Error ? error.message : String(error);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  });

  type SyncView =
    | { kind: 'empty' }
    | { kind: 'valid'; bytes: number }
    | { kind: 'invalid'; message: string; snippet?: string }
    | { kind: 'output'; text: string }
    | { kind: 'tree'; node: JsonTreeNode }
    | {
        kind: 'json-diff';
        diffs: JsonDiff[];
        lineDiff?: DiffResult;
        parseNote?: string;
      }
    | { kind: 'line-diff'; diff: DiffResult };

  const sync = $derived.by((): SyncView => {
    void optionValues;

    if (meta.chunk === 'repair' || meta.chunk === 'highlight') return { kind: 'empty' };

    if (meta.kind === 'compare') {
      if (input === '' && inputB === '') return { kind: 'empty' };
      if (meta.family === 'json') {
        const left = parseJson(input === '' ? 'null' : input);
        const right = parseJson(inputB === '' ? 'null' : inputB);
        if (input === '' || inputB === '') {
          return { kind: 'line-diff', diff: diffLines(input, inputB) };
        }
        if (!left.ok || !right.ok) {
          const parts: string[] = [];
          if (!left.ok) parts.push(`Left: ${left.error.message}`);
          if (!right.ok) parts.push(`Right: ${right.error.message}`);
          return {
            kind: 'json-diff',
            diffs: [],
            lineDiff: diffLines(input, inputB),
            parseNote: `${parts.join(' ')} Showing a line diff of the text instead.`,
          };
        }
        return { kind: 'json-diff', diffs: diffJson(left.value, right.value) };
      }
      return { kind: 'line-diff', diff: diffLines(input, inputB) };
    }

    if (input.trim() === '') return { kind: 'empty' };

    if (meta.kind === 'validate') {
      if (meta.family === 'json') {
        const parsed = parseJson(input);
        if (parsed.ok) return { kind: 'valid', bytes: new TextEncoder().encode(input).length };
        return { kind: 'invalid', message: parsed.error.message, snippet: parsed.error.snippet };
      }
      const parsed = validateXml(input);
      if (parsed.ok) return { kind: 'valid', bytes: new TextEncoder().encode(input).length };
      return { kind: 'invalid', message: parsed.error.detail ?? parsed.error.message };
    }

    if (meta.kind === 'view') {
      const parsed = parseJson(input);
      if (!parsed.ok) return { kind: 'invalid', message: parsed.error.message, snippet: parsed.error.snippet };
      return { kind: 'tree', node: jsonTree(parsed.value) };
    }

    if (meta.kind === 'transform' && meta.family === 'json') {
      try {
        const sortKeys = optionValues.sortKeys === 'sort';
        const text =
          meta.op === 'minify'
            ? minifyJson(input, { sortKeys })
            : formatJson(input, { indent: indentFromOption(optionValues.indent ?? '2'), sortKeys });
        return { kind: 'output', text };
      } catch (error) {
        const snippet = error && typeof error === 'object' && 'snippet' in error ? String(error.snippet ?? '') : undefined;
        return {
          kind: 'invalid',
          message: error instanceof Error ? error.message : String(error),
          snippet: snippet === '' ? undefined : snippet,
        };
      }
    }

    if (meta.kind === 'transform' && meta.family === 'xml') {
      try {
        const text =
          meta.op === 'minify'
            ? minifyXml(input, optionValues.comments === 'strip')
            : formatXml(input, (optionValues.indent as '2' | '4' | 'tab') ?? '2');
        return { kind: 'output', text };
      } catch (error) {
        const detail =
          error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string'
            ? error.detail
            : error instanceof Error
              ? error.message
              : String(error);
        return { kind: 'invalid', message: detail };
      }
    }

    return { kind: 'empty' };
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <div class="flex flex-col gap-1.5">
    <label for="format-input" class="text-xs font-medium text-muted">{inputLabel}</label>
    <textarea
      id="format-input"
      bind:value={input}
      rows={meta.kind === 'compare' ? 8 : 10}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder={meta.placeholder}
      class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
             font-mono text-sm text-fg placeholder:text-muted
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    ></textarea>
  </div>

  {#if meta.kind === 'compare'}
    <div class="flex flex-col gap-1.5">
      <label for="format-input-b" class="text-xs font-medium text-muted">Right</label>
      <textarea
        id="format-input-b"
        bind:value={inputB}
        rows="8"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder={meta.family === 'json' ? '{ "a": 1, "b": 3 }' : 'one\ntwo\nfour'}
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
    </div>
  {/if}

  {#if meta.controls.length > 0}
    <div class="flex flex-wrap gap-x-5 gap-y-3">
      {#each meta.controls as control (control.id)}
        <Field label={control.label} for="format-{control.id}" hint={control.hint}>
          <Select id="format-{control.id}" bind:value={options[control.id]} options={control.options} />
        </Field>
      {/each}
    </div>
  {/if}

  {#if meta.kind === 'validate' && sync.kind === 'valid'}
    <p
      class="rounded-lg border border-ok/40 bg-ok/5 px-3 py-2.5 text-sm text-ok"
      role="status"
    >Valid {meta.family === 'xml' ? 'XML' : 'JSON'}. {sync.bytes} byte{sync.bytes === 1 ? '' : 's'}.</p>
  {/if}

  {#if sync.kind === 'invalid'}
    <div class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
      <p>{sync.message}</p>
      {#if sync.snippet}
        <pre class="mt-2 overflow-x-auto font-mono text-xs whitespace-pre">{sync.snippet}</pre>
      {/if}
    </div>
  {/if}

  {#if sync.kind === 'output'}
    <OutputArea value={sync.text} label="Output" meta={`${sync.text.length} characters`} />
  {/if}

  {#if sync.kind === 'tree'}
    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-muted">Tree</span>
      <div
        class="max-h-[32rem] overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5"
        aria-label="JSON tree"
      >
        <JsonTree node={sync.node} />
      </div>
    </div>
  {/if}

  {#if sync.kind === 'json-diff'}
    {#if sync.parseNote}
      <p class="text-xs text-muted">{sync.parseNote}</p>
    {/if}
    {#if sync.diffs.length === 0 && sync.lineDiff === undefined}
      <p class="rounded-lg border border-ok/40 bg-ok/5 px-3 py-2.5 text-sm text-ok" role="status">
        The two documents are structurally identical. Key order does not count.
      </p>
    {:else if sync.diffs.length > 0}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted">{sync.diffs.length} difference{sync.diffs.length === 1 ? '' : 's'}</span>
        <ul class="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {#each sync.diffs as change (change.path + change.kind)}
            <li class="bg-surface px-3 py-2 font-mono text-xs">
              <span class="text-muted">{change.path}</span>
              {#if change.kind === 'added'}
                <span class="text-ok"> added {previewJson(change.value)}</span>
              {:else if change.kind === 'removed'}
                <span class="text-danger"> removed {previewJson(change.value)}</span>
              {:else}
                <span class="text-fg">
                  {previewJson(change.from)} → {previewJson(change.to)}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
    {#if sync.lineDiff}
      <DiffView diff={sync.lineDiff} />
    {/if}
  {/if}

  {#if sync.kind === 'line-diff'}
    <DiffView diff={sync.diff} />
  {/if}

  {#if meta.chunk === 'repair'}
    {#if repairError}
      <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
        {repairError}
      </p>
    {:else if repairView}
      {#if repairView.alreadyValid}
        <p class="text-xs text-ok" role="status">This is already valid JSON. Formatted below.</p>
      {:else}
        <p class="text-xs text-ok" role="status">Repaired. JSON.parse accepts the result.</p>
      {/if}
      <OutputArea value={repairView.formatted} label="Repaired JSON" />
    {/if}
  {/if}

  {#if meta.chunk === 'highlight'}
    {#if highlightError}
      <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
        {highlightError}
      </p>
    {:else if highlightView && input !== ''}
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-muted">
            Highlighted{#if highlightView.language}{` as ${highlightView.language}`}{/if}{#if highlightView.detected}{' (detected)'}{/if}
          </span>
          <CopyButton text={input} />
        </div>
        <pre
          class="hljs max-h-[32rem] overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
                 font-mono text-sm text-fg"
          aria-label="Highlighted code"
        ><code>{@html highlightView.html}</code></pre>
      </div>
    {/if}
  {/if}

  <p class="text-xs text-muted">{meta.blurb}</p>
</div>
