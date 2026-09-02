// @vitest-environment jsdom
/**
 * Behaviour of the file checksum widget.
 *
 * The interesting logic here is not the hashing -- that is covered in
 * parity.test.ts -- but the comparison box, which has to accept the several
 * shapes a published checksum arrives in, and the reset behaviour.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import FileHash from '~/components/widgets/FileHash.svelte';

afterEach(cleanup);

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const SHA256_ABC_BASE64 = 'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=';

function abcFile(): File {
  return new File(['abc'], 'notes.txt', { type: 'text/plain' });
}

async function dropFile(user: ReturnType<typeof userEvent.setup>) {
  // The visible drop zone hides a file input; upload() drives that directly.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, abcFile());
}

describe('FileHash', () => {
  it('hashes a chosen file and shows its name and size', async () => {
    const user = userEvent.setup();
    render(FileHash, { algorithm: 'sha256' });

    await dropFile(user);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SHA256_ABC));
    expect(screen.getByText('notes.txt')).toBeInTheDocument();
    expect(screen.getByText(/3 B/)).toBeInTheDocument();
  });

  it('confirms a matching hex checksum', async () => {
    const user = userEvent.setup();
    render(FileHash, { algorithm: 'sha256' });
    await dropFile(user);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SHA256_ABC));

    await user.type(screen.getByLabelText(/Compare with a published checksum/), SHA256_ABC);
    await waitFor(() => expect(screen.getByText(/^Match/)).toBeInTheDocument());
  });

  it('accepts an uppercase checksum with a trailing filename', async () => {
    const user = userEvent.setup();
    render(FileHash, { algorithm: 'sha256' });
    await dropFile(user);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SHA256_ABC));

    // The shape sha256sum actually prints, upper-cased to be awkward.
    await user.type(
      screen.getByLabelText(/Compare with a published checksum/),
      `${SHA256_ABC.toUpperCase()}  notes.txt`,
    );
    await waitFor(() => expect(screen.getByText(/^Match/)).toBeInTheDocument());
  });

  it('accepts a Base64 checksum while displaying hex', async () => {
    const user = userEvent.setup();
    render(FileHash, { algorithm: 'sha256' });
    await dropFile(user);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SHA256_ABC));

    await user.type(
      screen.getByLabelText(/Compare with a published checksum/),
      SHA256_ABC_BASE64,
    );
    await waitFor(() => expect(screen.getByText(/^Match/)).toBeInTheDocument());
  });

  it('rejects a checksum that does not match', async () => {
    const user = userEvent.setup();
    render(FileHash, { algorithm: 'sha256' });
    await dropFile(user);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SHA256_ABC));

    await user.type(screen.getByLabelText(/Compare with a published checksum/), 'a'.repeat(64));
    await waitFor(() => expect(screen.getByText(/^No match/)).toBeInTheDocument());
  });

  it('says nothing until a checksum is entered', async () => {
    const user = userEvent.setup();
    render(FileHash, { algorithm: 'sha256' });
    await dropFile(user);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SHA256_ABC));

    expect(screen.queryByText(/^Match/)).toBeNull();
    expect(screen.queryByText(/^No match/)).toBeNull();
  });

  it('returns to the drop zone when the file is cleared', async () => {
    const user = userEvent.setup();
    render(FileHash, { algorithm: 'sha256' });
    await dropFile(user);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SHA256_ABC));

    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(screen.getByText(/Drop a file here/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Result appears here/);
  });
});
