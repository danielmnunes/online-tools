// @vitest-environment jsdom
/**
 * The file codec widget.
 *
 * jsdom has no real file system, but it has File and Blob, which is all this
 * widget touches: it reads through slice() and arrayBuffer() exactly as it does
 * in a browser. So what runs here is the same path, with a file made in the
 * test rather than chosen from a dialog.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import FileCodec from '~/components/widgets/FileCodec.svelte';

afterEach(cleanup);

function file(name: string, content: string | Uint8Array): File {
  const body = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  // Copied into a fresh buffer: the DOM types want bytes that are not shared.
  return new File([body.slice()], name, { type: 'application/octet-stream' });
}

/** The drop target is a labelled button that opens the file input. */
async function drop(user: ReturnType<typeof userEvent.setup>, chosen: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await user.upload(input, chosen);
}

describe('encoding a file', () => {
  it('encodes a dropped file and says how big it was', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'encode' });

    await drop(user, file('hello.txt', 'foobar'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Zm9vYmFy'));
    expect(screen.getByText('hello.txt')).toBeInTheDocument();
    expect(screen.getByText(/6 B/)).toBeInTheDocument();
  });

  it('offers the whole result as a download rather than only showing it', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'encode' });

    await drop(user, file('hello.txt', 'foobar'));
    await waitFor(() => expect(screen.getByRole('link', { name: /Download/ })).toBeInTheDocument());

    const link = screen.getByRole('link', { name: /Download/ });
    expect(link).toHaveAttribute('download', 'hello.base64.txt');
    // A blob URL built in the page: there is no server to point it at.
    expect(link.getAttribute('href')).toMatch(/^blob:/);
  });

  it('re-encodes when an option changes, rather than leaving a stale result', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'encode' });

    // Five bytes, not six: "foobar" is an exact multiple of three and its
    // Base64 carries no padding, so a test built on it could not tell whether
    // the re-encode had happened at all.
    await drop(user, file('hello.txt', 'fooba'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Zm9vYmE='));

    await user.selectOptions(screen.getByLabelText('Padding'), 'off');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Zm9vYmE'));
    expect(screen.getByRole('status')).not.toHaveTextContent('=');
  });

  it('re-encodes when the alphabet changes, which is the option that was stale', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base32', direction: 'encode' });

    await drop(user, file('bytes.bin', new Uint8Array([1, 2, 3, 4, 5])));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('AEBAGBAF'));

    await user.selectOptions(screen.getByLabelText('Alphabet'), 'crockford');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('04106105'));
  });

  it('re-decodes when the alphabet changes, so an error does not outlive it', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base32', direction: 'decode' });

    // "0" is not in the RFC 4648 alphabet and is in the extended-hex one.
    await drop(user, file('payload.txt', '04106105'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Not valid Base32/));

    await user.selectOptions(screen.getByLabelText('Alphabet'), 'crockford');
    await waitFor(() => expect(screen.getByRole('status')).not.toHaveTextContent(/Not valid Base32/));
  });

  it('wraps Base64 as a data URL on request, which is what most uses want', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'encode' });

    await drop(user, file('hello.bin', 'foobar'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Zm9vYmFy'));

    await user.click(screen.getByLabelText('Wrap as a data URL'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'data:application/octet-stream;base64,Zm9vYmFy',
      ),
    );
  });

  it('wraps as a data URL that is valid even when the options say otherwise', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'encode' });

    // Two bytes: standard Base64 "AQI=", URL-safe "AQI" unpadded. A data URL
    // promises the standard, padded, unwrapped spelling.
    await drop(user, file('two.bin', new Uint8Array([1, 2])));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('AQI='));

    await user.selectOptions(screen.getByLabelText('Padding'), 'off');
    await user.selectOptions(screen.getByLabelText('Alphabet'), 'url');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('AQI'));

    await user.click(screen.getByLabelText('Wrap as a data URL'));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'data:application/octet-stream;base64,AQI=',
      ),
    );
  });

  it('gives a file page the same controls the text page has', () => {
    render(FileCodec, { codec: 'base32', direction: 'encode' });
    expect(screen.getByLabelText('Alphabet')).toBeInTheDocument();
    expect(screen.getByLabelText('Padding')).toBeInTheDocument();
  });
});

describe('decoding a file', () => {
  it('decodes an encoded file and offers the bytes back', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'decode' });

    await drop(user, file('payload.b64', 'Zm9vYmFy'));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('foobar'));
    const link = screen.getByRole('link', { name: /Download the decoded file/ });
    expect(link).toHaveAttribute('download', 'payload.bin');
    // Named after the dropped file, with the extension replaced: the decoder
    // knows the bytes and not the format.
    expect(screen.getAllByText('6 B').length).toBeGreaterThan(0);
  });

  it('shows bytes that are not text as hex', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'decode' });

    await drop(user, file('blob.b64', '3q2+7w=='));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('deadbeef'));
  });

  it('reports a file that is not the encoding it claims', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'decode' });

    await drop(user, file('broken.b64', 'not base64 at all!'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Not valid Base64/));
  });

  it('lets you choose another file when the first was the wrong one', async () => {
    const user = userEvent.setup();
    render(FileCodec, { codec: 'base64', direction: 'decode' });

    await drop(user, file('payload.b64', 'Zm9vYmFy'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('foobar'));

    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(screen.getByText(/Drop a file here/)).toBeInTheDocument();
  });
});
