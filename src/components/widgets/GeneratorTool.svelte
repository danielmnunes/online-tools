<script lang="ts">
  import { untrack } from 'svelte';
  import {
    GENERATORS,
    type GeneratorId,
    type UuidVersion,
  } from '~/lib/algo/generators';
  import {
    NAMESPACES,
    generateUuid,
    inspectUuid,
    randomNode,
    type UuidFormat,
    type UuidInfo,
  } from '~/lib/uuid';
  import {
    CHARSETS,
    DEFAULT_LENGTH,
    MAX_LENGTH,
    MIN_LENGTH,
    alphabetFor,
    entropyBits,
    generatePassword,
    type CharsetId,
  } from '~/lib/password';
  import { bytesToHex, hexToBytes } from '~/lib/encoding';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import NumberField from '~/components/ui/NumberField.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';
  import FileDrop from '~/components/ui/FileDrop.svelte';

  interface Props {
    id: GeneratorId;
  }
  let { id }: Props = $props();

  const meta = $derived(GENERATORS[id]);

  const UUID_FORMATS: ReadonlyArray<{ value: UuidFormat; label: string }> = [
    { value: 'canonical', label: '8-4-4-4-12' },
    { value: 'canonical-upper', label: '8-4-4-4-12 uppercase' },
    { value: 'hex', label: 'Hex' },
    { value: 'hex-upper', label: 'Hex uppercase' },
    { value: 'urn', label: 'URN' },
  ];

  const NS_OPTIONS = [
    { value: 'dns', label: 'DNS' },
    { value: 'url', label: 'URL' },
    { value: 'oid', label: 'OID' },
    { value: 'x500', label: 'X.500 DN' },
    { value: 'custom', label: 'Custom' },
  ] as const;

  const ECC_OPTIONS = [
    { value: 'L', label: 'L (~7%)' },
    { value: 'M', label: 'M (~15%)' },
    { value: 'Q', label: 'Q (~25%)' },
    { value: 'H', label: 'H (~30%)' },
  ] as const;

  let uuidFormat = $state<UuidFormat>('canonical');
  let uuidCount = $state(1);
  let uuidName = $state('');
  let uuidNs = $state<(typeof NS_OPTIONS)[number]['value']>('dns');
  let uuidNsCustom = $state('');
  let uuidNode = $state('');
  let uuidInspect = $state('');
  let generated = $state('');
  let genError = $state('');

  let pwLength = $state(DEFAULT_LENGTH);
  let pwLower = $state(true);
  let pwUpper = $state(true);
  let pwDigits = $state(true);
  let pwSymbols = $state(true);
  let pwAmbiguous = $state(false);
  let pwRequire = $state(true);
  let pwCount = $state(1);

  let qrText = $state('');
  let qrEcc = $state<'L' | 'M' | 'Q' | 'H'>('M');
  let qrSvg = $state('');
  let qrMeta = $state('');
  let qrError = $state('');

  let scanHits = $state<ReadonlyArray<{ text: string; format: string }>>([]);
  let scanError = $state('');
  let scanPending = $state(false);
  let cameraOn = $state(false);
  let videoEl: HTMLVideoElement | undefined = $state();
  let cameraStream: MediaStream | undefined;

  const nameBased = $derived(meta.kind === 'uuid' && (meta.version === 3 || meta.version === 5));
  const timeBased = $derived(meta.kind === 'uuid' && (meta.version === 1 || meta.version === 6));

  const namespaceValue = $derived.by(() => {
    if (uuidNs === 'custom') return uuidNsCustom.trim();
    return NAMESPACES[uuidNs];
  });

  const namedUuid = $derived.by(() => {
    if (!nameBased || meta.version === undefined) return undefined;
    if (uuidName === '' || namespaceValue === '') return undefined;
    try {
      return {
        ok: true as const,
        value: generateUuid(meta.version, {
          namespace: namespaceValue,
          name: uuidName,
          format: uuidFormat,
        }),
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const uuidOutput = $derived(namedUuid?.ok === true ? namedUuid.value : generated);
  const uuidOutputError = $derived(namedUuid?.ok === false ? namedUuid.error : genError);

  const uuidInfo = $derived.by((): UuidInfo | undefined => {
    const line = uuidOutput.split('\n')[0]?.trim() ?? '';
    if (line === '') return undefined;
    try {
      return inspectUuid(line);
    } catch {
      return undefined;
    }
  });

  const pastedInfo = $derived.by((): { ok: true; value: UuidInfo } | { ok: false; error: string } | undefined => {
    if (uuidInspect.trim() === '') return undefined;
    try {
      return { ok: true, value: inspectUuid(uuidInspect) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  const pwSets = $derived.by((): CharsetId[] => {
    const sets: CharsetId[] = [];
    if (pwLower) sets.push('lower');
    if (pwUpper) sets.push('upper');
    if (pwDigits) sets.push('digits');
    if (pwSymbols) sets.push('symbols');
    return sets;
  });

  const pwAlphabetSize = $derived.by(() => {
    try {
      return alphabetFor({
        length: pwLength,
        sets: pwSets,
        excludeAmbiguous: pwAmbiguous,
      }).length;
    } catch {
      return 0;
    }
  });

  const pwBits = $derived(entropyBits(pwLength, pwAlphabetSize));

  function btnClass(): string {
    return `rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted
            transition-colors hover:bg-surface hover:text-fg
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`;
  }

  function generateUuids() {
    if (meta.kind !== 'uuid' || meta.version === undefined || nameBased) return;
    const version = meta.version as UuidVersion;
    const count = Math.min(100, Math.max(1, Math.trunc(uuidCount) || 1));
    try {
      const time =
        timeBased && uuidNode.trim() !== ''
          ? { node: hexToBytes(uuidNode) }
          : undefined;
      if (time?.node !== undefined && time.node.length !== 6) {
        throw new Error('Node ID is 6 bytes (12 hex digits).');
      }
      const lines: string[] = [];
      for (let i = 0; i < count; i++) {
        lines.push(generateUuid(version, { format: uuidFormat, time }));
      }
      generated = lines.join('\n');
      genError = '';
    } catch (error) {
      generated = '';
      genError = error instanceof Error ? error.message : String(error);
    }
  }

  function generatePasswords() {
    const count = Math.min(100, Math.max(1, Math.trunc(pwCount) || 1));
    try {
      const lines: string[] = [];
      for (let i = 0; i < count; i++) {
        lines.push(
          generatePassword({
            length: Math.trunc(pwLength) || DEFAULT_LENGTH,
            sets: pwSets,
            excludeAmbiguous: pwAmbiguous,
            requireEverySet: pwRequire,
          }),
        );
      }
      generated = lines.join('\n');
      genError = '';
    } catch (error) {
      generated = '';
      genError = error instanceof Error ? error.message : String(error);
    }
  }

  function fillRandomNode() {
    uuidNode = bytesToHex(randomNode());
  }

  $effect(() => {
    const kind = meta.kind;
    const version = meta.version;
    void uuidFormat;
    if (kind === 'uuid' && version !== 3 && version !== 5) {
      untrack(() => generateUuids());
    }
    if (kind === 'password') {
      untrack(() => generatePasswords());
    }
  });

  $effect(() => {
    const chunk = meta.chunk;
    const text = qrText;
    const ecc = qrEcc;
    if (chunk !== 'qr-encode') {
      qrSvg = '';
      qrMeta = '';
      qrError = '';
      return;
    }
    if (text === '') {
      qrSvg = '';
      qrMeta = '';
      qrError = '';
      return;
    }
    let cancelled = false;
    void import('~/lib/qr').then(({ encodeQr }) => {
      if (cancelled) return;
      try {
        const result = encodeQr(text, ecc);
        qrSvg = result.svg;
        qrMeta = `Version ${result.version} · ${result.size}×${result.size} modules · ECC ${result.ecc}`;
        qrError = '';
      } catch (error) {
        qrSvg = '';
        qrMeta = '';
        qrError = error instanceof Error ? error.message : String(error);
      }
    });
    return () => {
      cancelled = true;
    };
  });

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function downloadSvg() {
    if (qrSvg === '') return;
    void import('~/lib/qr').then(({ svgFile }) => triggerDownload(svgFile(qrSvg), 'qr.svg'));
  }

  function downloadPng() {
    if (qrSvg === '') return;
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        canvas.toBlob((png) => {
          if (png) triggerDownload(png, 'qr.png');
        }, 'image/png');
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => URL.revokeObjectURL(url);
    image.src = url;
  }

  async function decodeImage(file: File) {
    scanPending = true;
    scanError = '';
    try {
      const { decodeQr } = await import('~/lib/qr-scan');
      scanHits = await decodeQr(file);
      if (scanHits.length === 0) scanError = 'No QR code in that image.';
    } catch (error) {
      scanHits = [];
      scanError = error instanceof Error ? error.message : String(error);
    } finally {
      scanPending = false;
    }
  }

  async function startCamera() {
    scanError = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      scanError = 'This browser does not expose a camera.';
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      cameraOn = true;
      if (videoEl) videoEl.srcObject = cameraStream;
    } catch (error) {
      cameraOn = false;
      scanError =
        error instanceof Error ? error.message : 'The camera could not be opened.';
    }
  }

  function stopCamera() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = undefined;
    cameraOn = false;
    if (videoEl) videoEl.srcObject = null;
  }

  $effect(() => {
    return () => stopCamera();
  });

  $effect(() => {
    if (!cameraOn || meta.kind !== 'qr-scan') return;
    let cancelled = false;
    let busy = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let decode: ((input: ImageData) => Promise<{ text: string; format: string }[]>) | undefined;

    void import('~/lib/qr-scan').then((mod) => {
      if (!cancelled) decode = mod.decodeQr;
    });

    function tick() {
      if (cancelled || !videoEl || !ctx) return;
      if (decode && videoEl.readyState >= 2 && !busy && videoEl.videoWidth > 0) {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        busy = true;
        void decode(imageData)
          .then((hits) => {
            if (!cancelled && hits.length > 0) {
              scanHits = hits;
              scanError = '';
            }
          })
          .catch((error: unknown) => {
            if (!cancelled) {
              scanError = error instanceof Error ? error.message : String(error);
            }
          })
          .finally(() => {
            busy = false;
          });
      }
      if (!cancelled) requestAnimationFrame(tick);
    }
    const frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  });

  function infoRows(info: UuidInfo): ReadonlyArray<readonly [string, string]> {
    const rows: Array<[string, string]> = [
      ['Version', String(info.version)],
      ['Variant', info.variant === 'rfc9562' ? 'RFC 9562' : info.variant],
    ];
    if (info.timestamp) rows.push(['Timestamp', info.timestamp.toISOString()]);
    if (info.unixMs !== undefined) rows.push(['Unix ms', String(info.unixMs)]);
    if (info.clockSequence !== undefined) {
      rows.push(['Clock sequence', String(info.clockSequence)]);
    }
    if (info.node !== undefined) {
      const grouped = info.node.replace(/(.{2})/g, '$1:').slice(0, -1);
      rows.push(['Node', grouped + (info.multicastNode ? ' (multicast)' : '')]);
    }
    return rows;
  }
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  {#if meta.kind === 'uuid'}
    {#if nameBased}
      <div class="flex flex-wrap gap-x-5 gap-y-3">
        <Field label="Namespace" for="gen-ns">
          <Select id="gen-ns" bind:value={uuidNs} options={NS_OPTIONS} />
        </Field>
        {#if uuidNs === 'custom'}
          <div class="min-w-64 flex-1">
            <Field label="Namespace UUID" for="gen-ns-custom">
              <input
                id="gen-ns-custom"
                type="text"
                bind:value={uuidNsCustom}
                spellcheck="false"
                autocapitalize="off"
                autocomplete="off"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
                       placeholder:text-muted
                       focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
              />
            </Field>
          </div>
        {/if}
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="gen-name" class="text-xs font-medium text-muted">Name</label>
        <input
          id="gen-name"
          type="text"
          bind:value={uuidName}
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          placeholder={meta.placeholder}
          class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
                 placeholder:text-muted
                 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </div>
    {/if}

    {#if timeBased}
      <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div class="min-w-64 flex-1">
          <Field
            label="Node ID (optional)"
            for="gen-node"
            hint="12 hex digits. Empty means a new random multicast address."
          >
            <input
              id="gen-node"
              type="text"
              bind:value={uuidNode}
              spellcheck="false"
              autocapitalize="off"
              autocomplete="off"
              placeholder="9f:6b:de:ce:d8:46"
              class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
                     placeholder:text-muted
                     focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          </Field>
        </div>
        <button type="button" class={btnClass()} onclick={fillRandomNode}>Random node</button>
      </div>
    {/if}

    <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
      <Field label="Format" for="gen-format">
        <Select id="gen-format" bind:value={uuidFormat} options={UUID_FORMATS} />
      </Field>
      {#if !nameBased}
        <NumberField id="gen-count" label="Count" bind:value={uuidCount} min={1} max={100} width="w-20" />
        <button type="button" class={btnClass()} onclick={generateUuids}>Generate</button>
      {/if}
    </div>

    <OutputArea value={uuidOutput} error={uuidOutputError || undefined} label="UUID" />

    {#if uuidInfo}
      <dl class="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {#each infoRows(uuidInfo) as [label, value] (label)}
          <div class="flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
            <dt class="w-40 shrink-0 text-xs text-muted">{label}</dt>
            <dd class="min-w-0 flex-1 font-mono text-sm break-all text-fg">{value}</dd>
            <CopyButton text={value} />
          </div>
        {/each}
      </dl>
    {/if}

    <div class="flex flex-col gap-1.5">
      <label for="gen-inspect" class="text-xs font-medium text-muted">Inspect a UUID</label>
      <input
        id="gen-inspect"
        type="text"
        bind:value={uuidInspect}
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder="Paste any UUID"
        class="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-sm text-fg
               placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
    </div>
    {#if pastedInfo?.ok === false}
      <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
        {pastedInfo.error}
      </p>
    {/if}
    {#if pastedInfo?.ok === true}
      <dl class="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {#each [['Canonical', pastedInfo.value.canonical], ...infoRows(pastedInfo.value)] as [label, value] (label)}
          <div class="flex flex-col gap-0.5 bg-surface px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
            <dt class="w-40 shrink-0 text-xs text-muted">{label}</dt>
            <dd class="min-w-0 flex-1 font-mono text-sm break-all text-fg">{value}</dd>
            <CopyButton text={value} />
          </div>
        {/each}
      </dl>
    {/if}
  {/if}

  {#if meta.kind === 'password'}
    <NumberField
      id="pw-length"
      label="Length"
      bind:value={pwLength}
      min={MIN_LENGTH}
      max={MAX_LENGTH}
      unit="characters"
      width="w-24"
    />
    <fieldset class="flex flex-col gap-2">
      <legend class="text-xs font-medium text-muted">Alphabet</legend>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={pwLower} class="accent-accent" />
        Lowercase ({CHARSETS.lower})
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={pwUpper} class="accent-accent" />
        Uppercase ({CHARSETS.upper})
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={pwDigits} class="accent-accent" />
        Digits ({CHARSETS.digits})
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={pwSymbols} class="accent-accent" />
        Symbols ({CHARSETS.symbols})
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={pwAmbiguous} class="accent-accent" />
        Exclude ambiguous (0 O I l 1)
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={pwRequire} class="accent-accent" />
        At least one character from each selected set
      </label>
    </fieldset>
    <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
      <NumberField id="pw-count" label="Count" bind:value={pwCount} min={1} max={100} width="w-20" />
      <button type="button" class={btnClass()} onclick={generatePasswords}>Generate</button>
    </div>
    <OutputArea
      value={generated}
      error={genError || undefined}
      label="Password"
      meta={pwAlphabetSize > 0 ? `${pwBits.toFixed(1)} bits` : undefined}
    />
  {/if}

  {#if meta.kind === 'qr-encode'}
    <div class="flex flex-col gap-1.5">
      <label for="qr-text" class="text-xs font-medium text-muted">Text</label>
      <textarea
        id="qr-text"
        bind:value={qrText}
        rows="4"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder={meta.placeholder}
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
    </div>
    <Field label="Error correction" for="qr-ecc" hint="How much of the code can be destroyed and still read.">
      <Select id="qr-ecc" bind:value={qrEcc} options={ECC_OPTIONS} />
    </Field>
    {#if qrError}
      <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
        {qrError}
      </p>
    {/if}
    {#if qrSvg}
      <div class="flex flex-col gap-2">
        <span class="text-xs font-medium text-muted">{qrMeta}</span>
        <div
          class="w-fit max-w-full overflow-auto rounded-lg border border-border bg-white p-2"
          role="status"
          aria-label="QR code"
        >
          {@html qrSvg}
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class={btnClass()} onclick={downloadSvg}>Download SVG</button>
          <button type="button" class={btnClass()} onclick={downloadPng}>Download PNG</button>
        </div>
      </div>
    {/if}
  {/if}

  {#if meta.kind === 'qr-scan'}
    <FileDrop
      accept="image/*"
      heading="Drop an image here, or click to choose"
      hint="The image is decoded in this tab. It is never uploaded."
      onfile={decodeImage}
      disabled={scanPending}
    />
    <div class="flex flex-wrap gap-2">
      {#if cameraOn}
        <button type="button" class={btnClass()} onclick={stopCamera}>Stop camera</button>
      {:else}
        <button type="button" class={btnClass()} onclick={startCamera}>Use camera</button>
      {/if}
    </div>
    <video
      bind:this={videoEl}
      class={cameraOn ? 'w-full max-w-md rounded-lg border border-border' : 'hidden'}
      autoplay
      playsinline
      muted
    ></video>
    {#if scanPending}
      <p class="text-sm text-muted" role="status">Decoding…</p>
    {/if}
    {#if scanError}
      <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger" role="alert">
        {scanError}
      </p>
    {/if}
    {#if scanHits.length > 0}
      <ul class="flex flex-col gap-3">
        {#each scanHits as hit, index (index + hit.text)}
          <li>
            <OutputArea value={hit.text} label={scanHits.length > 1 ? `QR ${index + 1}` : 'Contents'} meta={hit.format} />
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <p class="text-xs text-muted">{meta.blurb}</p>
</div>
