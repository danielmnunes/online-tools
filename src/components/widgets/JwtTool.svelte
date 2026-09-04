<script lang="ts">
  import { canVerify, decodeJwt, timings, verifyJwt, type DecodedJwt, type JwtVerification } from '~/lib/jwt';
  import { bytesToHex, textToBytes, type InputEncoding } from '~/lib/encoding';
  import { INPUT_ENCODINGS } from '~/lib/encoding';
  import Field from '~/components/ui/Field.svelte';
  import Select from '~/components/ui/Select.svelte';
  import CopyButton from '~/components/ui/CopyButton.svelte';

  let token = $state('');

  let secret = $state('');
  let secretEncoding = $state<InputEncoding>('utf-8');
  let publicKey = $state('');

  let verification = $state<JwtVerification | undefined>(undefined);
  let checking = $state(false);

  /** Guards against an earlier verification landing after a later one. */
  let runId = 0;

  const decoded = $derived.by((): { ok: true; jwt: DecodedJwt } | { ok: false; error: string } | undefined => {
    if (token.trim() === '') return undefined;
    try {
      return { ok: true, jwt: decodeJwt(token) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

  const jwt = $derived(decoded?.ok === true ? decoded.jwt : undefined);

  /** HS256 and friends take a shared secret; the rest take a public key. */
  const needsSecret = $derived((jwt?.algorithm ?? '').startsWith('HS'));

  /** Time claims, read against a clock that ticks only while the page is open. */
  const claims = $derived.by(() => {
    if (jwt === undefined) return [];
    return timings(jwt.payload, Math.floor(Date.now() / 1000));
  });

  const expired = $derived(claims.some((claim) => claim.claim === 'exp' && claim.state === 'past'));
  const notYet = $derived(claims.some((claim) => claim.claim === 'nbf' && claim.state === 'future'));

  async function check() {
    const id = ++runId;
    // Cleared before anything is awaited: a page whose job is to say whether
    // a signature holds must never show the previous token's answer while it
    // is working the new one out. Same when there is nothing to check.
    verification = undefined;
    if (jwt === undefined) return;

    checking = true;
    try {
      const result = await verifyJwt(jwt, {
        ...(needsSecret ? { secret: secret === '' ? undefined : textToBytes(secret, secretEncoding) } : {}),
        ...(needsSecret ? {} : { publicKey: publicKey === '' ? undefined : publicKey }),
      });
      if (id !== runId) return;
      verification = result;
    } catch (e) {
      // A secret that is not valid under the encoding it was typed as throws
      // here, before any key exists. Saying so is the difference between a
      // wrong answer and no answer.
      if (id !== runId) return;
      verification = {
        verified: false,
        detail: e instanceof Error ? e.message : 'The key could not be read.',
      };
    } finally {
      if (id === runId) checking = false;
    }
  }

  $effect(() => {
    void jwt;
    void secret;
    void secretEncoding;
    void publicKey;
    void check();
  });
</script>

<div class="flex flex-col gap-4 rounded-xl border border-border bg-bg p-4 sm:p-5">
  <div class="flex flex-col gap-1.5">
    <label for="jwt-input" class="text-xs font-medium text-muted">Token</label>
    <textarea
      id="jwt-input"
      bind:value={token}
      rows="4"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.…"
      class="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5
             font-mono text-sm text-fg placeholder:text-muted
             focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
    ></textarea>
    <p class="text-xs text-muted">
      Three segments separated by dots. A <code class="font-mono">Bearer</code> prefix is fine, and
      nothing is sent anywhere.
    </p>
  </div>

  {#if decoded?.ok === false}
    <p
      class="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2.5 text-sm text-danger"
      role="alert"
    >{decoded.error}</p>
  {/if}

  {#if jwt !== undefined}
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="rounded-md border border-border bg-surface px-2 py-1 font-mono text-fg">
        alg: {jwt.algorithm === '' ? 'none' : jwt.algorithm}
      </span>
      {#if jwt.header.typ !== undefined}
        <span class="rounded-md border border-border bg-surface px-2 py-1 font-mono text-fg">
          typ: {jwt.header.typ}
        </span>
      {/if}
      {#if jwt.header.kid !== undefined}
        <span class="rounded-md border border-border bg-surface px-2 py-1 font-mono text-fg">
          kid: {jwt.header.kid}
        </span>
      {/if}
      {#if expired}
        <span class="rounded-md border border-danger/50 bg-danger/5 px-2 py-1 font-medium text-danger">
          expired
        </span>
      {/if}
      {#if notYet}
        <span class="rounded-md border border-danger/50 bg-danger/5 px-2 py-1 font-medium text-danger">
          not yet valid
        </span>
      {/if}
    </div>

    {#if claims.length > 0}
      <dl class="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs">
        {#each claims as claim (claim.claim)}
          <div class="flex flex-wrap gap-x-2">
            <dt class="font-mono font-medium text-fg">{claim.claim}</dt>
            <dd class="text-muted">
              {claim.relative} · {claim.date.toISOString()}
            </dd>
          </div>
        {/each}
      </dl>
    {/if}

    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted">Header</span>
        <CopyButton text={jwt.headerJson} />
      </div>
      <pre
        aria-label="Decoded header"
        class="max-h-40 overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-xs text-fg whitespace-pre-wrap break-all"
      >{jwt.headerJson}</pre>
    </div>

    <div class="flex flex-col gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted">Payload</span>
        <CopyButton text={jwt.payloadJson} />
      </div>
      <pre
        aria-label="Decoded payload"
        class="max-h-72 overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-xs text-fg whitespace-pre-wrap break-all"
      >{jwt.payloadJson}</pre>
      <p class="text-xs text-muted">
        The payload is Base64URL, not encrypted. Anyone who has the token can read it; the signature
        only says it was not changed.
      </p>
    </div>

    <div class="flex flex-col gap-1.5">
      <span class="text-xs font-medium text-muted">
        Signature ({jwt.signature.length} byte{jwt.signature.length === 1 ? '' : 's'})
      </span>
      <pre
        aria-label="Signature bytes"
        class="max-h-24 overflow-auto rounded-lg border border-border bg-surface px-3 py-2.5
               font-mono text-xs text-fg whitespace-pre-wrap break-all"
      >{jwt.unsigned ? '— none: the third segment is empty —' : bytesToHex(jwt.signature)}</pre>
    </div>

    <div class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3">
      <h2 class="text-xs font-semibold text-fg">Check the signature</h2>

      {#if !canVerify()}
        <p class="text-xs text-muted">
          This browser does not expose the Web Crypto API, so the signature cannot be checked here.
          Everything above is still accurate: it is only the check that is missing.
        </p>
      {:else if needsSecret}
        <Field
          label="Shared secret"
          for="jwt-secret"
          hint="The same secret the issuer signed with. It is not in the token, and cannot be recovered from it."
        >
          <input
            id="jwt-secret"
            type="text"
            bind:value={secret}
            spellcheck="false"
            autocomplete="off"
            class="w-full rounded-md border border-border bg-bg px-2.5 py-1.5 font-mono text-sm text-fg
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
        </Field>
        <Field label="Secret encoding" for="jwt-secret-encoding">
          <Select id="jwt-secret-encoding" bind:value={secretEncoding} options={INPUT_ENCODINGS} />
        </Field>
      {:else}
        <div class="flex flex-col gap-1.5">
          <label for="jwt-public-key" class="text-xs font-medium text-muted">
            Public key (PEM or JWK)
          </label>
          <textarea
            id="jwt-public-key"
            bind:value={publicKey}
            rows="4"
            spellcheck="false"
            autocomplete="off"
            placeholder="-----BEGIN PUBLIC KEY-----"
            class="w-full resize-y rounded-lg border border-border bg-bg px-3 py-2.5
                   font-mono text-xs text-fg placeholder:text-muted
                   focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          ></textarea>
          <p class="text-xs text-muted">
            The public key is not a secret, but a token is: this check stays in the browser.
          </p>
        </div>
      {/if}

      {#if verification !== undefined}
        <p
          aria-live="polite"
          aria-busy={checking}
          class="rounded-lg border px-3 py-2.5 text-sm
                 {verification.verified
            ? 'border-ok/50 bg-ok/5 text-ok'
            : 'border-border bg-bg text-muted'}"
        >
          <span class="font-medium">
            {verification.verified ? 'Signature verified.' : 'Not verified.'}
          </span>
          {verification.detail}
        </p>
      {/if}
    </div>

    <p class="text-xs text-muted">
      Verified here means verified with the key above, under the algorithm named in the header. A
      token that names <code class="font-mono">none</code>, or whose signature is missing, is
      reported as unverifiable rather than as valid.
    </p>
  {/if}
</div>
