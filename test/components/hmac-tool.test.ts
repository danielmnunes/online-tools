// @vitest-environment jsdom
/**
 * Behaviour of the standalone HMAC calculator.
 *
 * HMAC itself is verified against RFC 2202 and RFC 4231 vectors and against
 * OpenSSL elsewhere. This covers the widget: switching hashes, the signature
 * comparison box and the prefix stripping that makes pasting a webhook header
 * work without editing it first.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import HmacTool from '~/components/widgets/HmacTool.svelte';

afterEach(cleanup);

/** RFC 4231 case 2: key "Jefe", message "what do ya want for nothing?". */
const RFC4231_KEY = 'Jefe';
const RFC4231_MESSAGE = 'what do ya want for nothing?';
const RFC4231_SHA256 = '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843';
const RFC2202_MD5 = '750c783e6ab0b503eaa86e310a5db738';

function output(): HTMLElement {
  return screen.getByRole('status');
}

async function fillRfcCase(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Message'), RFC4231_MESSAGE);
  await user.type(screen.getByLabelText('Secret key'), RFC4231_KEY);
}

describe('HmacTool', () => {
  it('computes HMAC-SHA-256 by default', async () => {
    const user = userEvent.setup();
    render(HmacTool);
    await fillRfcCase(user);
    await waitFor(() => expect(output()).toHaveTextContent(RFC4231_SHA256));
  });

  it('recomputes when the hash changes', async () => {
    const user = userEvent.setup();
    render(HmacTool);
    await fillRfcCase(user);
    await waitFor(() => expect(output()).toHaveTextContent(RFC4231_SHA256));

    await user.selectOptions(screen.getByLabelText('Hash'), 'md5');
    await waitFor(() => expect(output()).toHaveTextContent(RFC2202_MD5));
  });

  it('offers no BLAKE hash, because those take a key natively', () => {
    render(HmacTool);
    const options = [...screen.getByLabelText('Hash').querySelectorAll('option')].map(
      (option) => option.value,
    );
    expect(options).toContain('sha256');
    expect(options).not.toContain('blake2b');
    expect(options).not.toContain('blake3');
    expect(options).not.toContain('double-sha256');
  });

  it('matches a pasted signature', async () => {
    const user = userEvent.setup();
    render(HmacTool);
    await fillRfcCase(user);
    await waitFor(() => expect(output()).toHaveTextContent(RFC4231_SHA256));

    await user.type(screen.getByLabelText(/Compare with a received signature/), RFC4231_SHA256);
    await waitFor(() =>
      expect(screen.getByText(/the message and key produce this signature/i)).toBeInTheDocument(),
    );
  });

  it('strips the sha256= prefix that webhook headers carry', async () => {
    const user = userEvent.setup();
    render(HmacTool);
    await fillRfcCase(user);
    await waitFor(() => expect(output()).toHaveTextContent(RFC4231_SHA256));

    await user.type(
      screen.getByLabelText(/Compare with a received signature/),
      `sha256=${RFC4231_SHA256}`,
    );
    await waitFor(() =>
      expect(screen.getByText(/the message and key produce this signature/i)).toBeInTheDocument(),
    );
  });

  it('reports a mismatch rather than staying silent', async () => {
    const user = userEvent.setup();
    render(HmacTool);
    await fillRfcCase(user);
    await waitFor(() => expect(output()).toHaveTextContent(RFC4231_SHA256));

    await user.type(screen.getByLabelText(/Compare with a received signature/), 'deadbeef');
    await waitFor(() =>
      expect(screen.getByText(/the message, the key or the hash differs/i)).toBeInTheDocument(),
    );
  });

  it('warns when the key is longer than the block, because HMAC hashes it down', async () => {
    const user = userEvent.setup();
    const { container } = render(HmacTool);
    const hints = () =>
      [...container.querySelectorAll('p')].map((p) => p.textContent ?? '').join(' | ');

    await user.type(screen.getByLabelText('Secret key'), 'k'.repeat(65));
    await waitFor(() => expect(hints()).toMatch(/hashes it down to 32 bytes first/));
  });

  it('reports a decoding error instead of a stale tag', async () => {
    const user = userEvent.setup();
    render(HmacTool);
    await fillRfcCase(user);
    await waitFor(() => expect(output()).toHaveTextContent(RFC4231_SHA256));

    await user.selectOptions(screen.getByLabelText('Message encoding'), 'hex');
    await waitFor(() => expect(output()).toHaveTextContent(/^Hex input/));
  });
});
