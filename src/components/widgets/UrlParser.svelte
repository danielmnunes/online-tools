<script lang="ts">
  import { parseUrl, type ParsedUrl } from '~/lib/url-parser';
  import Field from '~/components/ui/Field.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';

  let input = $state('https://example.com/path?query=value#section');

  const parsed = $derived.by((): { ok: true; url: ParsedUrl } | { ok: false; error: string } | undefined => {
    if (input.trim() === '') return undefined;
    try {
      return { ok: true, url: parseUrl(input) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  /** The parts, in the order they appear in the URL rather than alphabetically. */
  const rows = $derived.by(() => {
    const url = parsed?.ok === true ? parsed.url : undefined;
    if (url === undefined) return [];
    return [
      ['href', url.href],
      ['origin', url.origin],
      ['protocol', url.protocol],
      ['host', url.host],
      ['hostname', url.hostname],
      ['port', url.port],
      ['pathname', url.pathname],
      ['search', url.search],
      ['hash', url.hash],
      ['username', url.username],
      ['password', url.password],
    ].filter(([, value]) => value !== '') as ReadonlyArray<readonly [string, string]>;
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <Field label="URL" for="url-input">
    <input
      id="url-input"
      type="text"
      bind:value={input}
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
      placeholder="https://example.com/path?query=value"
      class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
             placeholder:text-muted
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    />
  </Field>

  {#if parsed?.ok === false}
    <p
      class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger"
      role="alert"
    >{parsed.error}</p>
  {/if}

  {#if parsed?.ok === true}
    {@const url = parsed.url}
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted">Components</span>
        <CopyButton text={rows.map(([key, value]) => `${key}: ${value}`).join('\n')} />
      </div>
      <dl class="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {#each rows as [key, value] (key)}
          <div class="flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:gap-3">
            <dt class="w-28 shrink-0 font-mono text-xs text-muted">{key}</dt>
            <dd class="min-w-0 font-mono text-sm break-all text-fg">{value}</dd>
          </div>
        {/each}
      </dl>
    </div>

    {#if url.params.length > 0}
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted">
          Query parameters ({url.params.length})
        </span>
        <div class="overflow-x-auto rounded-lg border border-border">
          <table class="w-full text-left text-sm">
            <thead class="bg-surface text-xs text-muted">
              <tr>
                <th scope="col" class="px-3 py-2 font-medium">Key</th>
                <th scope="col" class="px-3 py-2 font-medium">Value</th>
                <th scope="col" class="px-3 py-2 font-medium">As written</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border">
              {#each url.params as param, index (index)}
                <tr>
                  <td class="px-3 py-2 font-mono text-xs break-all text-fg">{param.key}</td>
                  <td class="px-3 py-2 font-mono text-xs break-all text-fg">{param.value}</td>
                  <td class="px-3 py-2 font-mono text-xs break-all text-muted">
                    {param.rawValue === param.value ? '' : param.rawValue}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {:else}
      <p class="text-xs text-muted">This URL has no query string.</p>
    {/if}

    {#if url.notes.length > 0}
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted">Worth knowing</span>
        <ul class="flex flex-col gap-2">
          {#each url.notes as note (note)}
            <li class="rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-muted">
              {note}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>
