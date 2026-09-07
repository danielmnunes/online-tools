<script lang="ts">
  import { CASE_IDS, CONVERTS, type CaseId, type ConvertId } from '~/lib/algo/converts';
  import { allCases, convertCase } from '~/lib/case';
  import { formatTime, parseTime, toDateTimeLocal } from '~/lib/time';
  import Field from '~/components/ui/Field.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';

  interface Props {
    id: ConvertId;
  }
  let { id }: Props = $props();

  const meta = $derived(CONVERTS[id]);

  let input = $state('');
  let nowTick = $state(Date.now());

  const labels: Record<CaseId, string> = {
    'case-lower': 'lower case',
    'case-upper': 'UPPER CASE',
    'case-camel': 'camelCase',
    'case-pascal': 'PascalCase',
    'case-snake': 'snake_case',
    'case-kebab': 'kebab-case',
    'case-constant': 'CONSTANT_CASE',
  };

  const caseOutput = $derived(meta.kind === 'case' && meta.case ? convertCase(input, meta.case) : '');
  const neighbours = $derived(meta.kind === 'case' ? allCases(input) : undefined);

  const timeParsed = $derived.by(() => {
    if (meta.kind !== 'time') return undefined;
    if (input.trim() === '') return undefined;
    try {
      return { ok: true as const, value: parseTime(input) };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const timeView = $derived.by(() => {
    void nowTick;
    if (timeParsed?.ok !== true) return undefined;
    return formatTime(timeParsed.value, new Date(nowTick));
  });

  $effect(() => {
    if (meta.kind !== 'time') return;
    const timer = setInterval(() => (nowTick = Date.now()), 1000);
    return () => clearInterval(timer);
  });

  function useNow() {
    input = String(Math.floor(Date.now() / 1000));
  }

  function fromPicker(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    if (value === '') return;
    input = toDateTimeLocal(new Date(value));
  }
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <label for="convert-input" class="text-xs font-medium text-muted">
        {meta.kind === 'time' ? 'Timestamp or date' : 'Text'}
      </label>
      {#if meta.kind === 'time'}
        <button
          type="button"
          onclick={useNow}
          class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
                 transition-colors hover:bg-surface hover:text-fg
                 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >Use now</button>
      {/if}
    </div>
    {#if meta.kind === 'case'}
      <textarea
        id="convert-input"
        bind:value={input}
        rows="5"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder={meta.placeholder}
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
    {:else}
      <input
        id="convert-input"
        type="text"
        bind:value={input}
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder={meta.placeholder}
        class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
               placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
    {/if}
  </div>

  {#if meta.kind === 'time'}
    <Field label="Local datetime" for="convert-local" hint="The timezone of this machine, not UTC.">
      <input
        id="convert-local"
        type="datetime-local"
        step="1"
        value={timeParsed?.ok === true ? toDateTimeLocal(timeParsed.value.date).slice(0, 19) : ''}
        onchange={fromPicker}
        class="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
    </Field>
  {/if}

  {#if meta.kind === 'case'}
    <OutputArea value={caseOutput} label={meta.name} />

    {#if neighbours !== undefined && input.trim() !== ''}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted">The other cases</span>
        <dl class="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {#each CASE_IDS.filter((other) => other !== meta.case) as other (other)}
            <div class="flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
              <dt class="w-36 shrink-0 text-xs text-muted">{labels[other]}</dt>
              <dd class="min-w-0 flex-1 font-mono text-sm break-all text-fg">{neighbours[other]}</dd>
              <CopyButton text={neighbours[other]} />
            </div>
          {/each}
        </dl>
      </div>
    {/if}
  {/if}

  {#if timeParsed?.ok === false}
    <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
      {timeParsed.error}
    </p>
  {/if}

  {#if timeView}
    {@const rows: ReadonlyArray<readonly [string, string]> = [
      ['Unix seconds', timeView.unixSeconds],
      ['Unix milliseconds', timeView.unixMs],
      ['ISO 8601 (UTC)', timeView.isoUtc],
      ['Local ISO', timeView.isoLocal],
      ['RFC 2822', timeView.rfc2822],
      ['UTC', timeView.utcHuman],
      [`Local (${timeView.timeZone})`, timeView.localHuman],
      ['Relative', timeView.relative],
    ]}
    <dl class="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {#each rows as [label, value] (label)}
        <div class="flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
          <dt class="w-44 shrink-0 text-xs text-muted">{label}</dt>
          <dd class="min-w-0 flex-1 font-mono text-sm break-all text-fg">{value}</dd>
          <CopyButton text={value} />
        </div>
      {/each}
    </dl>
  {/if}

  <p class="text-xs text-muted">{meta.blurb}</p>
</div>
