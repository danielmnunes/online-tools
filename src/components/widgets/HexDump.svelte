<script lang="ts">
  import { untrack } from 'svelte';
  import { DEFAULT_HEXDUMP_OPTIONS, hexDumpLines, type HexDumpOptions } from '~/lib/hexdump';
  import { INPUT_ENCODINGS, textToBytes, type InputEncoding } from '~/lib/encoding';
  import { formatBytes } from '~/lib/format';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';
  import FileDrop from '~/components/ui/FileDrop.svelte';

  interface Props {
    /** Text page: type or paste. File page: drop a file and walk through it. */
    source: 'text' | 'file';
  }
  let { source }: Props = $props();

  /**
   * Bytes shown at once on the file page.
   *
   * A hex dump is roughly four characters wide per byte, so a megabyte of file
   * is four megabytes of text: far past what a browser renders usefully. The
   * file is read a page at a time with slice(), which is also what keeps the
   * offsets honest -- each page is labelled with where it came from.
   */
  const PAGE_BYTES = 4096;

  const PER_LINE = [
    { value: '8', label: '8' },
    { value: '16', label: '16' },
    { value: '32', label: '32' },
  ];
  const OFFSET_BASE = [
    { value: 'hex', label: 'Hexadecimal' },
    { value: 'decimal', label: 'Decimal' },
  ];

  let input = $state('');
  let inputEncoding = $state<InputEncoding>('utf-8');

  let bytesPerLine = $state('16');
  let offsetBase = $state<'hex' | 'decimal'>('hex');
  let uppercase = $state(false);
  let showAscii = $state(true);

  let file = $state<File | undefined>(undefined);
  let pageOffset = $state(0);
  let pageBytes = $state<Uint8Array | undefined>(undefined);
  let error = $state<string | undefined>(undefined);
  let loading = $state(false);

  const options = $derived<HexDumpOptions>({
    ...DEFAULT_HEXDUMP_OPTIONS,
    bytesPerLine: Number.parseInt(bytesPerLine, 10),
    offsetBase,
    uppercase,
    showAscii,
  });

  const textLines = $derived.by(() => {
    try {
      const bytes = textToBytes(input, inputEncoding);
      return { lines: hexDumpLines(bytes, options), bytes: bytes.length, error: undefined };
    } catch (e) {
      return { lines: [], bytes: 0, error: e instanceof Error ? e.message : String(e) };
    }
  });

  const displayError = $derived(error ?? (source === 'text' ? textLines.error : undefined));

  const pageLines = $derived(pageBytes === undefined ? [] : hexDumpLines(pageBytes, { ...options, baseOffset: pageOffset }));

  const dump = $derived(source === 'text' ? textLines.lines.join('\n') : pageLines.join('\n'));

  async function loadPage(offset: number) {
    if (file === undefined) return;
    const total = file.size;
    const start = Math.max(0, Math.min(offset, Math.max(0, total - 1)));
    loading = true;
    error = undefined;
    try {
      const buffer = await file.slice(start, Math.min(start + PAGE_BYTES, total)).arrayBuffer();
      pageBytes = new Uint8Array(buffer);
      pageOffset = start;
    } catch (e) {
      error = e instanceof Error ? e.message : 'The file could not be read.';
    } finally {
      loading = false;
    }
  }

  async function take(selected: File) {
    file = selected;
    pageBytes = undefined;
    error = undefined;
    await loadPage(0);
  }

  // Changing how the bytes are laid out has to redraw the page, and reading it
  // again is cheaper than reformatting a buffer we did not keep. The offset is
  // read untracked: it moves when a page loads, and this effect is not what
  // should be following it.
  $effect(() => {
    void options;
    const current = file;
    const at = untrack(() => pageOffset);
    if (current !== undefined) void loadPage(at);
  });

  function reset() {
    file = undefined;
    pageBytes = undefined;
    pageOffset = 0;
    error = undefined;
  }

  const pageEnd = $derived(pageOffset + (pageBytes?.length ?? 0));
  const totalPages = $derived(file === undefined ? 0 : Math.max(1, Math.ceil(file.size / PAGE_BYTES)));
  const currentPage = $derived(Math.floor(pageOffset / PAGE_BYTES) + 1);
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  {#if source === 'text'}
    <div class="flex flex-col gap-1.5">
      <label for="dump-input" class="text-xs font-medium text-muted">Input</label>
      <textarea
        id="dump-input"
        bind:value={input}
        rows="4"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder="Type or paste your text here…"
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
      <p class="text-xs text-muted">
        {textLines.bytes} byte{textLines.bytes === 1 ? '' : 's'}. A character is not a byte: an é is
        two in UTF-8, and an emoji is four.
      </p>
    </div>

    <Field label="Input encoding" for="input-encoding">
      <Select id="input-encoding" bind:value={inputEncoding} options={INPUT_ENCODINGS} />
    </Field>
  {:else if file === undefined}
    <FileDrop onfile={take} />
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div class="min-w-0">
        <p class="truncate font-mono text-sm text-fg">{file.name}</p>
        <p class="text-xs text-muted">
          {formatBytes(file.size)} · showing bytes {pageOffset.toLocaleString()}–{pageEnd.toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        onclick={reset}
        class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
      >Choose another</button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={() => loadPage(0)}
        disabled={pageOffset === 0}
        class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
               hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >First</button>
      <button
        type="button"
        onclick={() => loadPage(pageOffset - PAGE_BYTES)}
        disabled={pageOffset === 0}
        class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
               hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >Previous</button>
      <button
        type="button"
        onclick={() => loadPage(pageOffset + PAGE_BYTES)}
        disabled={pageEnd >= (file?.size ?? 0)}
        class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
               hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >Next</button>
      <button
        type="button"
        onclick={() => loadPage(Math.floor(((file?.size ?? 1) - 1) / PAGE_BYTES) * PAGE_BYTES)}
        disabled={pageEnd >= (file?.size ?? 0)}
        class="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted
               hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >Last</button>
      <span class="text-xs text-muted">
        page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
      </span>
    </div>
  {/if}

  <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
    <Field label="Bytes per line" for="bytes-per-line">
      <Select id="bytes-per-line" bind:value={bytesPerLine} options={PER_LINE} />
    </Field>
    <Field label="Offsets" for="offset-base">
      <Select id="offset-base" bind:value={offsetBase} options={OFFSET_BASE} />
    </Field>
    <label class="flex items-center gap-2 text-xs font-medium text-muted">
      <input
        type="checkbox"
        bind:checked={uppercase}
        class="size-4 rounded border-border accent-accent"
      />
      Uppercase hex
    </label>
    <label class="flex items-center gap-2 text-xs font-medium text-muted">
      <input
        type="checkbox"
        bind:checked={showAscii}
        class="size-4 rounded border-border accent-accent"
      />
      ASCII column
    </label>
  </div>

  {#if displayError !== undefined}
    <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
      {displayError}
    </p>
  {/if}

  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2">
      <span class="text-xs font-medium text-muted">Hex dump</span>
      <CopyButton text={dump} />
    </div>
    <!-- Deliberately not a live region: announcing four kilobytes of
         hexadecimal on every keystroke would be unusable. The byte count and
         the offset range above are what change audibly. -->
    <pre
      aria-label="Hex dump"
      aria-busy={loading}
      class="max-h-96 overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
             font-mono text-xs leading-relaxed text-fg whitespace-pre"
    >{#if displayError !== undefined}{displayError}{:else if dump === ''}<span
        class="text-muted">{source === 'text' ? 'The dump appears here.' : 'Drop a file to read it.'}</span
      >{:else}{dump}{/if}</pre>
  </div>
</div>
