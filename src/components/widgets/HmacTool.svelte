<script lang="ts">
  import { HASHES, HASH_IDS, type HashId } from '~/lib/algo/hashes';
  import { hashBytes } from '~/lib/algo/hash';
  import {
    INPUT_ENCODINGS,
    OUTPUT_ENCODINGS,
    bytesToText,
    textToBytes,
    type InputEncoding,
    type OutputEncoding,
  } from '~/lib/encoding';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import BytesInput from '~/components/ui/BytesInput.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';

  /**
   * Every hash that can drive HMAC.
   *
   * The BLAKE family is absent on purpose: it declares hmac: false because it
   * takes a key natively, and offering HMAC-BLAKE2b here would hand people a
   * construction nobody wants when the keyed form is a click away.
   */
  const ALGORITHMS = HASH_IDS.filter((id) => HASHES[id].hmac).map((id) => ({
    value: id,
    label: HASHES[id].label,
  }));

  let algorithm = $state<HashId>('sha256');
  let message = $state('');
  let messageEncoding = $state<InputEncoding>('utf-8');
  let key = $state('');
  let keyEncoding = $state<InputEncoding>('utf-8');
  let outputEncoding = $state<OutputEncoding>('hex');

  /** Set when the user pastes a signature to check against. */
  let expected = $state('');

  let digest = $state('');
  let digestBytes = $state<Uint8Array | undefined>(undefined);
  let error = $state<string | undefined>(undefined);
  let pending = $state(false);

  const meta = $derived(HASHES[algorithm]);
  const blockLen = $derived(meta.bits > 256 ? 128 : 64);

  /** Guards against a slow earlier run landing after a faster later one. */
  let runId = 0;

  const keyBytes = $derived.by(() => {
    try {
      return textToBytes(key, keyEncoding).length;
    } catch {
      return undefined;
    }
  });

  /**
   * HMAC hashes any key longer than the block size down before using it, so a
   * long key is not the extra strength it looks like. Worth saying, since
   * "use a longer key" is common advice that stops helping at this point.
   */
  const keyNote = $derived.by(() => {
    if (keyBytes === undefined) return undefined;
    if (keyBytes === 0) return 'An empty key is allowed by RFC 2104, and is not a key.';
    if (keyBytes > blockLen) {
      return `Longer than the ${blockLen}-byte block: HMAC hashes it down to ${meta.bits / 8} bytes first.`;
    }
    return undefined;
  });

  const comparison = $derived.by(() => {
    const candidate = expected.trim().split(/\s+/)[0] ?? '';
    if (candidate === '' || digestBytes === undefined) return undefined;
    const normalised = candidate.replace(/^(sha256=|sha1=|hmac-sha256=)/i, '');
    return OUTPUT_ENCODINGS.some(
      ({ value }) => bytesToText(digestBytes!, value).toLowerCase() === normalised.toLowerCase(),
    );
  });

  async function compute() {
    const id = ++runId;
    error = undefined;

    let data: Uint8Array;
    let hmacKey: Uint8Array;
    try {
      data = textToBytes(message, messageEncoding);
      hmacKey = textToBytes(key, keyEncoding);
    } catch (e) {
      digest = '';
      digestBytes = undefined;
      error = e instanceof Error ? e.message : String(e);
      return;
    }

    pending = true;
    try {
      const out = await hashBytes(algorithm, data, { hmacKey });
      if (id !== runId) return;
      digestBytes = out;
      digest = bytesToText(out, outputEncoding);
    } catch (e) {
      if (id !== runId) return;
      digest = '';
      digestBytes = undefined;
      error = e instanceof Error ? e.message : 'Computation failed.';
    } finally {
      if (id === runId) pending = false;
    }
  }

  $effect(() => {
    void algorithm;
    void message;
    void messageEncoding;
    void key;
    void keyEncoding;
    void outputEncoding;
    void compute();
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <Field label="Message" for="message">
    <textarea
      id="message"
      bind:value={message}
      rows="5"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder="The payload to authenticate — a webhook body, a request to sign…"
      class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
             font-mono text-sm text-fg placeholder:text-muted
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    ></textarea>
  </Field>

  <div class="rounded-lg border border-border bg-surface p-3">
    <BytesInput
      id="key"
      label="Secret key"
      bind:value={key}
      bind:encoding={keyEncoding}
      placeholder="The shared secret"
      hint={keyNote}
    />
  </div>

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    <Field label="Hash" for="algorithm">
      <Select id="algorithm" bind:value={algorithm} options={ALGORITHMS} />
    </Field>
    <Field label="Message encoding" for="message-encoding">
      <Select id="message-encoding" bind:value={messageEncoding} options={INPUT_ENCODINGS} />
    </Field>
    <Field label="Output encoding" for="output-encoding">
      <Select id="output-encoding" bind:value={outputEncoding} options={OUTPUT_ENCODINGS} />
    </Field>
  </div>

  <OutputArea
    value={digest}
    {error}
    {pending}
    label="HMAC-{meta.label}"
    meta="{meta.bits} bits"
  />

  <div class="flex flex-col gap-1.5">
    <label for="expected" class="text-xs font-medium text-muted">
      Compare with a received signature (optional)
    </label>
    <input
      id="expected"
      type="text"
      bind:value={expected}
      spellcheck="false"
      autocomplete="off"
      placeholder="Paste the signature from the header…"
      class="w-full rounded-md border px-2.5 py-1.5 font-mono text-sm text-fg
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
             {comparison === undefined
               ? 'border-border bg-surface'
               : comparison
                 ? 'border-ok/50 bg-ok/5'
                 : 'border-danger/50 bg-danger/5'}"
    />
    <p class="text-xs" aria-live="polite">
      {#if comparison === true}
        <span class="font-medium text-ok">Match — the message and key produce this signature.</span>
      {:else if comparison === false}
        <span class="font-medium text-danger">
          No match — the message, the key or the hash differs.
        </span>
      {:else}
        <span class="text-muted">
          Accepts hex or Base64, and strips a leading <code>sha256=</code> as GitHub and Stripe
          send it. In your own code, compare in constant time rather than with <code>==</code>.
        </span>
      {/if}
    </p>
  </div>
</div>
