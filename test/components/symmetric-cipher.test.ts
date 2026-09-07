// @vitest-environment jsdom
/**
 * The symmetric-cipher widget.
 *
 * Algorithm correctness lives in cipher.test.ts. What is tested here is the
 * wiring: that a page shows the controls its table entry declares, that a
 * NIST vector appears as it is typed, that an empty key is blank rather than
 * an error, and that ECB states its warning.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import SymmetricCipher from '~/components/widgets/SymmetricCipher.svelte';

afterEach(cleanup);

function set(label: string, value: string) {
  const field = screen.getByLabelText<HTMLInputElement | HTMLTextAreaElement>(label);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the controls a page gets', () => {
  it('gives AES a mode, padding, key and IV', () => {
    render(SymmetricCipher, { algorithm: 'aes', direction: 'encrypt' });
    expect(screen.getByLabelText('Mode')).toBeInTheDocument();
    expect(screen.getByLabelText('Padding')).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toBeInTheDocument();
    expect(screen.getByLabelText('IV')).toBeInTheDocument();
  });

  it('hides the IV on ECB', async () => {
    const user = userEvent.setup();
    render(SymmetricCipher, { algorithm: 'aes', direction: 'encrypt' });
    await user.selectOptions(screen.getByLabelText('Mode'), 'ecb');
    expect(screen.queryByLabelText('IV')).toBeNull();
    expect(screen.getByText(/identical plaintext blocks stay identical/i)).toBeInTheDocument();
  });

  it('gives ChaCha20-Poly1305 a nonce and associated data, and no padding', () => {
    render(SymmetricCipher, { algorithm: 'chacha20-poly1305', direction: 'encrypt' });
    expect(screen.getByLabelText('Nonce')).toBeInTheDocument();
    expect(screen.getByLabelText('Associated data')).toBeInTheDocument();
    expect(screen.queryByLabelText('Padding')).toBeNull();
    expect(screen.queryByLabelText('Mode')).toBeNull();
  });

  it('shows the DES warning on both pages', () => {
    render(SymmetricCipher, { algorithm: 'des', direction: 'decrypt' });
    expect(screen.getByText(/Do not use it to protect anything/i)).toBeInTheDocument();
  });
});

describe('encrypting what is typed', () => {
  it('matches the SP 800-38A ECB-AES128 vector', async () => {
    render(SymmetricCipher, { algorithm: 'aes', direction: 'encrypt' });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Mode'), 'ecb');
    await user.selectOptions(screen.getByLabelText('Padding'), 'none');
    set('Key', '2b7e151628aed2a6abf7158809cf4f3c');
    set('Plaintext', '6bc1bee22e409f96e93d7e117393172a');
    await user.selectOptions(screen.getByLabelText('Input encoding'), 'hex');
    await waitFor(() =>
      expect(document.querySelector('output')).toHaveTextContent(/3ad77bb40d7a3660a89ecaf32466ef97/i),
    );
  });

  it('stays blank while the key is empty, rather than showing an error', () => {
    render(SymmetricCipher, { algorithm: 'aes', direction: 'encrypt' });
    expect(screen.getByText('Result appears here.')).toBeInTheDocument();
  });
});
