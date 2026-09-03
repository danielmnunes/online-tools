<script lang="ts">
  import { untrack } from 'svelte';
  import { HASHES, type HashId } from '~/lib/algo/hashes';
  import {
    KDFS,
    KDF_HASHES,
    defaultCost,
    isArgon2,
    suggestedSaltLength,
    type KdfId,
  } from '~/lib/algo/kdfs';
  import { derive, usingWorkers, verify } from '~/lib/worker/kdf-client';
  import type { KdfJobInputs } from '~/lib/worker/kdf-protocol';
  import {
    OUTPUT_ENCODINGS,
    bytesToHex,
    bytesToText,
    textToBytes,
    type InputEncoding,
    type OutputEncoding,
  } from '~/lib/encoding';
  import { formatDuration } from '~/lib/format';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import NumberField from '~/components/ui/NumberField.svelte';
  import BytesInput from '~/components/ui/BytesInput.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';
  import OutputArea from '~/components/ui/OutputArea.svelte';

  interface Props {
    algorithm: KdfId;
    mode: 'derive' | 'verify';
  }
  let { algorithm, mode }: Props = $props();

  const meta = $derived(KDFS[algorithm]);
  const HASH_OPTIONS = KDF_HASHES.map((id) => ({ value: id, label: HASHES[id].label }));

  let password = $state('');
  let passwordEncoding = $state<InputEncoding>('utf-8');
  let salt = $state('');
  let saltEncoding = $state<InputEncoding>('utf-8');
  let info = $state('');
  let infoEncoding = $state<InputEncoding>('utf-8');
  let secret = $state('');
  let secretEncoding = $state<InputEncoding>('utf-8');
  let associatedData = $state('');
  let associatedDataEncoding = $state<InputEncoding>('utf-8');

  // untrack because capturing the initial value is the intent: one page is one
  // algorithm, so `algorithm` never changes for a mounted island.
  let hash = $state<HashId>(untrack(() => {
    const declared = KDFS[algorithm].hash;
    return declared === false ? 'sha256' : declared.default;
  }));
  let cost = $state<Record<string, number>>(untrack(() => defaultCost(algorithm)));
  let dkLen = $state(untrack(() => KDFS[algorithm].dkLen?.default ?? 32));
  let outputEncoding = $state<OutputEncoding>('hex');

  /** The stored hash or derived key being checked against, in verify mode. */
  let expected = $state('');

  let key = $state<Uint8Array | undefined>(undefined);
  let encoded = $state<string | undefined>(undefined);
  let outcome = $state<{ matches: boolean; source: string; parameters: string } | undefined>(
    undefined,
  );
  let error = $state<string | undefined>(undefined);
  let running = $state(false);
  let progress = $state(0);
  let elapsed = $state<number | undefined>(undefined);

  let controller: AbortController | undefined;

  /**
   * Deliberately not automatic.
   *
   * Every other widget on this site recomputes as you type. These cannot: a
   * single Argon2 run at the default parameters is most of a second of solid
   * CPU, and firing one per keystroke would queue dozens of them. The button
   * is the honest interface for work this expensive.
   */
  const label = $derived(mode === 'derive' ? `Derive with ${meta.label}` : 'Check the password');

  function randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    crypto.getRandomValues(out);
    return out;
  }

  function generateSalt() {
    salt = bytesToHex(randomBytes(suggestedSaltLength(algorithm)));
    saltEncoding = 'hex';
  }

  function inputs(): KdfJobInputs {
    return {
      password: textToBytes(password, passwordEncoding),
      salt: textToBytes(salt, saltEncoding),
      cost: { ...cost },
      dkLen,
      ...(meta.hash !== false ? { hash } : {}),
      ...(meta.info && info !== '' ? { info: textToBytes(info, infoEncoding) } : {}),
      ...(meta.extraInputs && secret !== ''
        ? { secret: textToBytes(secret, secretEncoding) }
        : {}),
      ...(meta.extraInputs && associatedData !== ''
        ? { associatedData: textToBytes(associatedData, associatedDataEncoding) }
        : {}),
    };
  }

  async function run() {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;

    key = undefined;
    encoded = undefined;
    outcome = undefined;
    error = undefined;
    elapsed = undefined;
    progress = 0;
    running = true;

    const startedAt = performance.now();
    try {
      const job = inputs();
      const hooks = {
        signal,
        onProgress: (fraction: number) => {
          if (!signal.aborted) progress = fraction;
        },
      };

      if (mode === 'derive') {
        const result = await derive(algorithm, job, hooks);
        if (signal.aborted) return;
        key = result.key;
        encoded = result.encoded;
      } else {
        const result = await verify(algorithm, job, expected, hooks);
        if (signal.aborted) return;
        key = result.computed;
        outcome = result;
      }
      elapsed = performance.now() - startedAt;
    } catch (e) {
      if (signal.aborted) return;
      error = e instanceof Error ? e.message : 'The derivation failed.';
    } finally {
      if (!signal.aborted) running = false;
    }
  }

  function cancel() {
    controller?.abort();
    running = false;
    progress = 0;
  }

  const derivedText = $derived(key ? bytesToText(key, outputEncoding) : '');

  /** Roughly what the parameters will cost, so nobody types 2^24 by accident. */
  const memoryNote = $derived.by(() => {
    if (algorithm === 'scrypt') {
      const bytes = 128 * (cost['N'] ?? 0) * (cost['r'] ?? 0);
      return `About ${(bytes / 1024 / 1024).toFixed(1)} MiB of memory.`;
    }
    if (isArgon2(algorithm)) {
      return `About ${((cost['m'] ?? 0) / 1024).toFixed(1)} MiB of memory.`;
    }
    return undefined;
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <BytesInput
    id="password"
    label={meta.secretLabel}
    bind:value={password}
    bind:encoding={passwordEncoding}
    placeholder={meta.secretLabel === 'Password' ? 'The password to stretch' : 'The key material to expand'}
  />

  {#if mode === 'verify'}
    <Field label="Stored hash or derived key" for="expected">
      <textarea
        id="expected"
        bind:value={expected}
        rows="2"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder={meta.encoded === 'bcrypt'
          ? '$2a$10$…'
          : meta.encoded === 'phc'
            ? '$argon2id$v=19$m=…  — or a bare digest in hex or Base64'
            : 'A digest in hex or Base64'}
        class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm text-fg placeholder:text-muted
               focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      ></textarea>
    </Field>
    <p class="-mt-2 text-xs text-muted">
      A self-describing hash carries its own salt and cost, and those win over anything set below.
      A bare digest does not, so the fields below have to match what produced it.
    </p>
  {/if}

  {#if algorithm !== 'bcrypt' || mode === 'derive'}
    <BytesInput
      id="salt"
      label={meta.salt === 'optional' ? 'Salt (optional)' : 'Salt'}
      bind:value={salt}
      bind:encoding={saltEncoding}
      onrandom={meta.randomSalt && mode === 'derive' ? generateSalt : undefined}
      randomLabel="Generate"
      hint={meta.salt === 'fixed-16'
        ? 'bcrypt takes exactly 16 bytes, which its string format then encodes for you.'
        : meta.salt === 'optional'
          ? 'Optional here, but a salt is what stops one table of precomputed answers covering everybody.'
          : undefined}
    />
  {/if}

  {#if meta.info}
    <BytesInput
      id="info"
      label="Info (optional)"
      bind:value={info}
      bind:encoding={infoEncoding}
      placeholder="e.g. handshake key expansion"
      hint="Binds the output to a context, so one input key can safely produce many unrelated keys."
    />
  {/if}

  {#if meta.extraInputs}
    <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <BytesInput
        id="secret"
        label="Secret key (optional)"
        bind:value={secret}
        bind:encoding={secretEncoding}
        hint="RFC 9106's K: a pepper held outside the database, so a stolen table alone is not enough."
      />
      <BytesInput
        id="associated-data"
        label="Associated data (optional)"
        bind:value={associatedData}
        bind:encoding={associatedDataEncoding}
        hint="RFC 9106's X: context bound into the hash, such as a user id."
      />
    </div>
  {/if}

  <div class="flex flex-wrap gap-x-5 gap-y-3">
    {#if meta.hash !== false}
      <Field label="Underlying hash" for="hash">
        <Select id="hash" bind:value={hash} options={HASH_OPTIONS} />
      </Field>
    {/if}

    {#each meta.cost as param (param.key)}
      <NumberField
        id="cost-{param.key}"
        label={param.label}
        bind:value={cost[param.key]}
        min={param.min}
        max={param.max}
        hint={param.hint}
        width={param.default > 9999 ? 'w-32' : 'w-24'}
      />
    {/each}

    {#if meta.dkLen}
      <NumberField
        id="output-length"
        label="Output length"
        bind:value={dkLen}
        min={meta.dkLen.min}
        max={meta.dkLen.max}
        unit="bytes"
      />
    {/if}

    <Field label="Output encoding" for="output-encoding">
      <Select id="output-encoding" bind:value={outputEncoding} options={OUTPUT_ENCODINGS} />
    </Field>
  </div>

  {#if memoryNote}
    <p class="-mt-1 text-xs text-muted">{memoryNote}</p>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
    <button
      type="button"
      onclick={run}
      disabled={running}
      class="rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg
             transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50
             focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {running ? 'Working…' : label}
    </button>
    {#if running}
      <button
        type="button"
        onclick={cancel}
        class="rounded-md border border-border px-3 py-2 text-sm font-medium text-muted
               hover:bg-surface hover:text-fg
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >Cancel</button>
    {/if}
    {#if elapsed !== undefined}
      <span class="text-xs text-muted">took {formatDuration(elapsed)}</span>
    {/if}
    {#if meta.heavy}
      <span class="text-xs text-muted">
        {usingWorkers()
          ? 'Runs in a background thread, so the page stays responsive.'
          : 'Runs on this thread.'}
      </span>
    {/if}
  </div>

  {#if running}
    <div>
      <div
        class="h-1.5 w-full overflow-hidden rounded-full bg-surface"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(progress * 100)}
        aria-label="Derivation progress"
      >
        <div
          class="h-full rounded-full bg-accent transition-[width] duration-150"
          style="width: {progress * 100}%"
        ></div>
      </div>
    </div>
  {/if}

  {#if mode === 'verify' && outcome !== undefined}
    <div
      class="rounded-lg border px-3 py-2.5 text-sm
             {outcome.matches ? 'border-ok/50 bg-ok/5' : 'border-danger/50 bg-danger/5'}"
      aria-live="polite"
    >
      <p class="font-medium {outcome.matches ? 'text-ok' : 'text-danger'}">
        {outcome.matches ? 'Match — this password produces that hash.' : 'No match.'}
      </p>
      <p class="mt-1 text-xs text-muted">
        Checked with {outcome.parameters}, read from
        {outcome.source === 'encoded' ? 'the hash itself' : 'the fields above'}.
      </p>
    </div>
  {/if}

  {#if encoded !== undefined}
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted">
          Storage form{#if meta.encoded === 'phc'} (PHC string){:else if meta.encoded === 'bcrypt'} (modular crypt){/if}
        </span>
        <CopyButton text={encoded} />
      </div>
      <!-- A div rather than an output element: this appears at the same moment
           as the result below, and two live regions announcing at once is
           worse for a screen reader than one. -->
      <div
        class="w-full rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-sm break-all whitespace-pre-wrap text-fg"
      >{encoded}</div>
      <p class="text-xs text-muted">
        Everything needed to check this password later, salt and parameters included. This is what
        goes in the database, not the raw bytes below.
      </p>
    </div>
  {/if}

  <OutputArea
    value={derivedText}
    {error}
    pending={running}
    label={mode === 'derive' ? 'Derived key' : 'Computed digest'}
    meta={key ? `${key.length} bytes` : undefined}
  />
</div>
