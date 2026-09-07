<script lang="ts">
  import { untrack } from 'svelte';
  import {
    ASYMMETRIC,
    EC_CURVES,
    HASH_ALGS,
    KEY_FORMATS,
    RSA_MODULUS,
    RSA_SIGN_PADDINGS,
    type AsymmetricId,
    type AsymmetricOp,
  } from '~/lib/algo/asymmetric';
  import {
    ecdsaSign,
    ecdsaVerify,
    generateEcdsaKeyPair,
    generateRsaKeyPair,
    rsaDecrypt,
    rsaEncrypt,
    rsaSign,
    rsaVerify,
    type EcCurve,
    type HashAlg,
    type KeyFormat,
    type RsaModulus,
    type RsaSignPadding,
  } from '~/lib/asymmetric';
  import {
    DISPLAY_ENCODINGS,
    INPUT_ENCODINGS,
    bytesToDisplayText,
    textToBytes,
    type DisplayEncoding,
    type InputEncoding,
  } from '~/lib/encoding';
  import CopyButton from '~/components/ui/CopyButton.svelte';
  import Field from '~/components/ui/Field.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';
  import Select from '~/components/ui/Select.svelte';

  interface Props {
    algorithm: AsymmetricId;
    operation: AsymmetricOp;
  }
  let { algorithm, operation }: Props = $props();

  const meta = $derived(ASYMMETRIC[algorithm]);
  const page = $derived(meta.pages[operation]);

  let keyMaterial = $state('');
  let message = $state('');
  let messageEncoding = $state<InputEncoding>('utf-8');
  let signature = $state('');
  let signatureEncoding = $state<InputEncoding>('hex');
  let outputEncoding = $state<DisplayEncoding>(
    untrack(() => (operation === 'encrypt' || operation === 'sign' ? 'hex' : 'utf-8')),
  );

  let modulus = $state<string>('2048');
  let curve = $state<string>('P-256');
  let hash = $state<HashAlg>('SHA-256');
  let padding = $state<RsaSignPadding>('pkcs1');
  let format = $state<KeyFormat>('pem');

  let publicKey = $state('');
  let privateKey = $state('');
  let output = $state('');
  let verified = $state<boolean | undefined>(undefined);
  let error = $state<string | undefined>(undefined);
  let pending = $state(false);
  let resultBytes = $state(0);

  let runId = 0;

  const isKeygen = $derived(operation === 'keygen');
  const isVerify = $derived(operation === 'verify');
  const needsPrivate = $derived(operation === 'decrypt' || operation === 'sign');

  async function generate() {
    error = undefined;
    pending = true;
    publicKey = '';
    privateKey = '';
    try {
      const pair =
        algorithm === 'rsa'
          ? await generateRsaKeyPair(Number.parseInt(modulus, 10) as RsaModulus, format)
          : await generateEcdsaKeyPair(curve as EcCurve, format);
      publicKey = pair.publicKey;
      privateKey = pair.privateKey;
    } catch (e) {
      error = e instanceof Error ? e.message : 'The key pair could not be generated.';
    } finally {
      pending = false;
    }
  }

  async function compute() {
    if (isKeygen) return;
    if (keyMaterial.trim() === '') {
      output = '';
      error = undefined;
      verified = undefined;
      pending = false;
      return;
    }
    const id = ++runId;
    error = undefined;
    verified = undefined;
    pending = true;
    try {
      const data = textToBytes(message, messageEncoding);
      let result: Uint8Array | boolean;
      if (algorithm === 'rsa') {
        switch (operation) {
          case 'encrypt':
            result = await rsaEncrypt(keyMaterial, data, hash);
            break;
          case 'decrypt':
            result = await rsaDecrypt(keyMaterial, data, hash);
            break;
          case 'sign':
            result = await rsaSign(keyMaterial, data, hash, padding);
            break;
          case 'verify':
            result = await rsaVerify(
              keyMaterial,
              data,
              textToBytes(signature, signatureEncoding),
              hash,
              padding,
            );
            break;
          default:
            throw new Error('RSA has no such operation.');
        }
      } else {
        switch (operation) {
          case 'sign':
            result = await ecdsaSign(keyMaterial, data, hash, curve as EcCurve);
            break;
          case 'verify':
            result = await ecdsaVerify(
              keyMaterial,
              data,
              textToBytes(signature, signatureEncoding),
              hash,
              curve as EcCurve,
            );
            break;
          default:
            throw new Error('ECDSA has no such operation.');
        }
      }
      if (id !== runId) return;
      if (typeof result === 'boolean') {
        verified = result;
        output = '';
        resultBytes = 0;
      } else {
        output = bytesToDisplayText(result, outputEncoding);
        resultBytes = result.length;
      }
    } catch (e) {
      if (id !== runId) return;
      output = '';
      resultBytes = 0;
      verified = undefined;
      error = e instanceof Error ? e.message : 'That could not be processed.';
    } finally {
      if (id === runId) pending = false;
    }
  }

  $effect(() => {
    void keyMaterial;
    void message;
    void messageEncoding;
    void signature;
    void signatureEncoding;
    void outputEncoding;
    void hash;
    void padding;
    void curve;
    void compute();
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  {#if isKeygen}
    <p class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-fg" role="status">
      {meta.warning}
    </p>
  {/if}

  {#if isKeygen}
    <div class="flex flex-wrap items-end gap-x-5 gap-y-3">
      {#if algorithm === 'rsa'}
        <Field label="Modulus" for="rsa-modulus">
          <Select id="rsa-modulus" bind:value={modulus} options={RSA_MODULUS} />
        </Field>
      {:else}
        <Field label="Curve" for="ec-curve">
          <Select id="ec-curve" bind:value={curve} options={EC_CURVES} />
        </Field>
      {/if}
      <Field label="Format" for="key-format">
        <Select id="key-format" bind:value={format} options={KEY_FORMATS} />
      </Field>
      <button
        type="button"
        onclick={generate}
        class="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg
               transition-colors hover:bg-bg
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {pending ? 'Generating…' : 'Generate key pair'}
      </button>
    </div>

    {#if error}
      <OutputArea value="" {error} label="Key pair" />
    {:else if privateKey}
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label for="generated-public" class="text-xs font-medium text-muted">Public key</label>
            <CopyButton text={publicKey} />
          </div>
          <textarea
            id="generated-public"
            readonly
            rows="6"
            class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
                   font-mono text-sm text-fg
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >{publicKey}</textarea>
        </div>
        <div class="flex flex-col gap-1.5">
          <div class="flex items-center justify-between">
            <label for="generated-private" class="text-xs font-medium text-muted">Private key</label>
            <CopyButton text={privateKey} />
          </div>
          <textarea
            id="generated-private"
            readonly
            rows="8"
            class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
                   font-mono text-sm text-fg
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >{privateKey}</textarea>
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex flex-col gap-1.5">
      <label for="asymmetric-key" class="text-xs font-medium text-muted">
        {needsPrivate ? 'Private key (PKCS#8 PEM or JWK)' : 'Public key (SPKI PEM or JWK)'}
      </label>
      <textarea
        id="asymmetric-key"
        bind:value={keyMaterial}
        rows="6"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder={needsPrivate
          ? '-----BEGIN PRIVATE KEY-----'
          : '-----BEGIN PUBLIC KEY-----'}
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="asymmetric-message" class="text-xs font-medium text-muted">
        {operation === 'decrypt' ? 'Ciphertext' : 'Message'}
      </label>
      <textarea
        id="asymmetric-message"
        bind:value={message}
        rows="4"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
    </div>

    {#if isVerify}
      <div class="flex flex-col gap-1.5">
        <label for="asymmetric-signature" class="text-xs font-medium text-muted">Signature</label>
        <textarea
          id="asymmetric-signature"
          bind:value={signature}
          rows="3"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
                 font-mono text-sm text-fg placeholder:text-muted
                 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        ></textarea>
      </div>
    {/if}

    <div class="flex flex-wrap gap-x-5 gap-y-3">
      <Field label={operation === 'decrypt' ? 'Ciphertext encoding' : 'Message encoding'} for="asymmetric-msg-enc">
        <Select id="asymmetric-msg-enc" bind:value={messageEncoding} options={INPUT_ENCODINGS} />
      </Field>
      {#if isVerify}
        <Field label="Signature encoding" for="asymmetric-sig-enc">
          <Select id="asymmetric-sig-enc" bind:value={signatureEncoding} options={INPUT_ENCODINGS} />
        </Field>
      {:else}
        <Field label="Show the result as" for="asymmetric-out-enc">
          <Select id="asymmetric-out-enc" bind:value={outputEncoding} options={DISPLAY_ENCODINGS} />
        </Field>
      {/if}
      <Field label="Hash" for="asymmetric-hash">
        <Select id="asymmetric-hash" bind:value={hash} options={HASH_ALGS} />
      </Field>
      {#if algorithm === 'rsa' && (operation === 'sign' || operation === 'verify')}
        <Field label="Padding" for="asymmetric-padding">
          <Select id="asymmetric-padding" bind:value={padding} options={RSA_SIGN_PADDINGS} />
        </Field>
      {/if}
      {#if algorithm === 'ecdsa'}
        <Field label="Curve" for="asymmetric-curve">
          <Select id="asymmetric-curve" bind:value={curve} options={EC_CURVES} />
        </Field>
      {/if}
    </div>

    {#if isVerify && verified !== undefined && error === undefined}
      <p
        class="rounded-lg border px-3 py-2 text-sm
               {verified
          ? 'border-accent/40 bg-accent/5 text-fg'
          : 'border-danger/40 bg-danger/5 text-danger'}"
        role="status"
      >
        {verified
          ? 'The signature verifies under this key.'
          : 'The signature does not verify. Either the message was changed, or this is not the key that signed it.'}
      </p>
    {:else}
      <OutputArea
        value={output}
        {error}
        {pending}
        label={page?.name ?? operation}
        meta={error === undefined && output !== ''
          ? `${resultBytes} byte${resultBytes === 1 ? '' : 's'} out`
          : undefined}
      />
    {/if}
  {/if}

  <p class="text-xs text-muted">{page?.blurb}</p>
</div>
