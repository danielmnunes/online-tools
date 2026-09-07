<script lang="ts">
  import { untrack } from 'svelte';
  import {
    CIPHERS,
    modeMeta,
    type CipherDirection,
    type CipherId,
    type CipherMode,
  } from '~/lib/algo/ciphers';
  import { cryptBytes } from '~/lib/algo/cipher';
  import { PADDINGS, type PaddingId } from '~/lib/algo/padding';
  import {
    DISPLAY_ENCODINGS,
    INPUT_ENCODINGS,
    bytesToDisplayText,
    bytesToHex,
    textToBytes,
    type DisplayEncoding,
    type InputEncoding,
  } from '~/lib/encoding';
  import { randomBytes } from '~/lib/random';
  import BytesInput from '~/components/ui/BytesInput.svelte';
  import Field from '~/components/ui/Field.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';
  import Select from '~/components/ui/Select.svelte';

  interface Props {
    algorithm: CipherId;
    direction: CipherDirection;
  }
  let { algorithm, direction }: Props = $props();

  const meta = $derived(CIPHERS[algorithm]);
  const page = $derived(direction === 'encrypt' ? meta.encrypt : meta.decrypt);

  let input = $state('');
  let inputEncoding = $state<InputEncoding>(untrack(() => (direction === 'decrypt' ? 'hex' : 'utf-8')));
  let outputEncoding = $state<DisplayEncoding>(
    untrack(() => (direction === 'encrypt' ? 'hex' : 'utf-8')),
  );

  let key = $state('');
  let keyEncoding = $state<InputEncoding>('hex');
  let iv = $state('');
  let ivEncoding = $state<InputEncoding>('hex');
  let aad = $state('');
  let aadEncoding = $state<InputEncoding>('utf-8');

  let mode = $state<CipherMode>(untrack(() => CIPHERS[algorithm].defaultMode));
  let padding = $state<PaddingId>(untrack(() => CIPHERS[algorithm].defaultPadding));

  let output = $state('');
  let error = $state<string | undefined>(undefined);
  let pending = $state(false);
  let resultBytes = $state(0);

  let runId = 0;

  const chosen = $derived(modeMeta(algorithm, mode));
  const modeOptions = $derived(meta.modes.map((entry) => ({ value: entry.id, label: entry.label })));
  const paddingOptions = $derived(PADDINGS.filter((entry) => meta.paddings.includes(entry.value)));
  const showPadding = $derived(chosen.padded);
  const showIv = $derived(chosen.ivBytes > 0);
  const showAad = $derived(chosen.aead);
  const keyHint = $derived(
    meta.keyChoices !== undefined
      ? `${meta.keyChoices.join(', ')} bytes`
      : `${meta.key.min}–${meta.key.max} bytes`,
  );

  function fillRandom(kind: 'key' | 'iv') {
    const length = kind === 'key' ? meta.defaultKeyBytes : chosen.ivBytes;
    const hex = bytesToHex(randomBytes(length));
    if (kind === 'key') {
      key = hex;
      keyEncoding = 'hex';
    } else {
      iv = hex;
      ivEncoding = 'hex';
    }
  }

  async function compute() {
    const id = ++runId;
    error = undefined;
    pending = true;
    try {
      const keyBytes = textToBytes(key, keyEncoding);
      if (keyBytes.length === 0) {
        if (id !== runId) return;
        output = '';
        resultBytes = 0;
        error = undefined;
        pending = false;
        return;
      }
      const data = textToBytes(input, inputEncoding);
      const ivBytes = showIv ? textToBytes(iv, ivEncoding) : new Uint8Array();
      const aadBytes = showAad ? textToBytes(aad, aadEncoding) : new Uint8Array();
      const result = await cryptBytes(algorithm, direction, data, {
        key: keyBytes,
        iv: showIv ? ivBytes : undefined,
        mode,
        padding: showPadding ? padding : 'none',
        aad: showAad ? aadBytes : undefined,
      });
      if (id !== runId) return;
      output = bytesToDisplayText(result, outputEncoding);
      resultBytes = result.length;
    } catch (e) {
      if (id !== runId) return;
      output = '';
      resultBytes = 0;
      error = e instanceof Error ? e.message : 'That could not be processed.';
    } finally {
      if (id === runId) pending = false;
    }
  }

  $effect(() => {
    void input;
    void inputEncoding;
    void outputEncoding;
    void key;
    void keyEncoding;
    void iv;
    void ivEncoding;
    void aad;
    void aadEncoding;
    void mode;
    void padding;
    void compute();
  });

  const sizeNote = $derived(`${resultBytes} byte${resultBytes === 1 ? '' : 's'}`);

  const ecbWarning =
    'ECB encrypts each block independently, so identical plaintext blocks stay identical in the ciphertext. Do not use it for anything that is not a single block.';
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  {#if meta.warning}
    <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-fg" role="status">
      {meta.warning}
    </p>
  {/if}
  {#if mode === 'ecb'}
    <p class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted" role="status">
      {ecbWarning}
    </p>
  {/if}

  <div class="flex flex-col gap-1.5">
    <label for="cipher-input" class="text-xs font-medium text-muted">
      {direction === 'encrypt' ? 'Plaintext' : 'Ciphertext'}
    </label>
    <textarea
      id="cipher-input"
      bind:value={input}
      rows="5"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder={direction === 'encrypt'
        ? 'Type or paste the bytes to encrypt…'
        : 'Paste the ciphertext. For GCM and ChaCha20-Poly1305 the last 16 bytes are the tag.'}
      class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
             font-mono text-sm text-fg placeholder:text-muted
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    ></textarea>
  </div>

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    <Field
      label={direction === 'encrypt' ? 'Input encoding' : 'Ciphertext encoding'}
      for="cipher-input-encoding"
    >
      <Select id="cipher-input-encoding" bind:value={inputEncoding} options={INPUT_ENCODINGS} />
    </Field>
    <Field label="Show the result as" for="cipher-output-encoding">
      <Select id="cipher-output-encoding" bind:value={outputEncoding} options={DISPLAY_ENCODINGS} />
    </Field>
    {#if meta.modes.length > 1}
      <Field label="Mode" for="cipher-mode">
        <Select id="cipher-mode" bind:value={mode} options={modeOptions} />
      </Field>
    {/if}
    {#if showPadding && paddingOptions.length > 1}
      <Field
        label="Padding"
        for="cipher-padding"
        hint="Zero padding cannot tell zeros that were in the message from zeros that were added."
      >
        <Select id="cipher-padding" bind:value={padding} options={paddingOptions} />
      </Field>
    {/if}
  </div>

  <BytesInput
    id="cipher-key"
    label="Key"
    bind:value={key}
    bind:encoding={keyEncoding}
    placeholder="Key bytes…"
    hint={keyHint}
    onrandom={() => fillRandom('key')}
    randomLabel="Random key"
  />

  {#if showIv}
    <BytesInput
      id="cipher-iv"
      label={chosen.aead ? 'Nonce' : 'IV'}
      bind:value={iv}
      bind:encoding={ivEncoding}
      placeholder="{chosen.ivBytes} bytes…"
      hint={`${chosen.ivBytes} bytes. Never reuse a nonce with the same key.`}
      onrandom={() => fillRandom('iv')}
      randomLabel={chosen.aead ? 'Random nonce' : 'Random IV'}
    />
  {/if}

  {#if showAad}
    <BytesInput
      id="cipher-aad"
      label="Associated data"
      bind:value={aad}
      bind:encoding={aadEncoding}
      placeholder="Optional. Authenticated, not encrypted."
      hint="Bound to the ciphertext but left in the clear. Empty is fine."
    />
  {/if}

  <OutputArea
    value={output}
    {error}
    {pending}
    label={page.name}
    meta={error === undefined && output !== '' ? sizeNote : undefined}
  />

  <p class="text-xs text-muted">{meta.blurb}</p>
</div>
