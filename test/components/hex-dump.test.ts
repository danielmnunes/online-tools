// @vitest-environment jsdom
/**
 * The hex dump widget, in both of its shapes.
 *
 * The layout itself is tested against hexdump -C in hexdump.test.ts; what is
 * here is the page: that pasted text is dumped as its bytes, that the options
 * take effect, and that the file page reads a page at a time and labels it with
 * the offset it has in the file.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import HexDump from '~/components/widgets/HexDump.svelte';

afterEach(cleanup);

/** The dump is a labelled pre, not a live region: see the component. */
function dump(): HTMLElement {
  return screen.getByLabelText('Hex dump');
}

describe('the text page', () => {
  it('shows the bytes of what was typed', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'text' });

    await user.type(screen.getByLabelText('Input'), 'Hello, world!');
    await waitFor(() => expect(dump()).toHaveTextContent('48 65 6c 6c 6f 2c 20 77'));
    expect(dump()).toHaveTextContent('|Hello, world!|');
  });

  it('says how many bytes the text became, which is not the character count', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'text' });

    await user.type(screen.getByLabelText('Input'), 'é');
    await waitFor(() => expect(dump()).toHaveTextContent('c3 a9'));
    expect(screen.getByText(/^2 bytes\./)).toBeInTheDocument();
  });

  it('lays out as many bytes per line as asked', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'text' });

    await user.type(screen.getByLabelText('Input'), 'abcdefghijklmnopqrstuvwxyz');
    await waitFor(() => expect(dump()).toHaveTextContent('61 62 63 64 65 66 67 68'));

    await user.selectOptions(screen.getByLabelText('Bytes per line'), '8');
    await waitFor(() => expect(dump()).toHaveTextContent('00000000 61 62 63 64 65 66 67 68'));
    expect(dump()).toHaveTextContent('00000008 69 6a 6b 6c 6d 6e 6f 70');
  });

  it('writes the hex in the case it is asked for', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'text' });

    // é is two bytes, and both of them have a letter in their hex.
    await user.type(screen.getByLabelText('Input'), 'é');
    await waitFor(() => expect(dump()).toHaveTextContent('c3 a9'));

    await user.click(screen.getByLabelText('Uppercase hex'));
    await waitFor(() => expect(dump()).toHaveTextContent('C3 A9'));
  });

  it('windows a large paste instead of rendering all of it', async () => {
    render(HexDump, { source: 'text' });

    // Set rather than typed: user-event types character by character, and the
    // point is what the page does with forty thousand characters, not how they
    // arrived.
    const input = screen.getByLabelText<HTMLTextAreaElement>('Input');
    input.value = 'x'.repeat(40_000);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await waitFor(() => expect(dump()).toHaveTextContent('00000000 78 78 78 78'));
    // 32 KiB is 2 048 lines of sixteen bytes; 40 000 bytes would be 2 500.
    expect(dump().textContent!.split('\n')).toHaveLength(2048);
    expect(screen.getByText(/Showing the first/)).toBeInTheDocument();
    // Rendering two thousand lines a few times over is not a five-second job.
  }, 20000);

  it('reports input that is not the encoding it was told it was', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'text' });

    await user.selectOptions(screen.getByLabelText('Input encoding'), 'hex');
    await user.type(screen.getByLabelText('Input'), 'zz');
    await waitFor(() => expect(dump()).toHaveTextContent(/outside 0-9 and a-f/));
  });
});

describe('the file page', () => {
  const big = new Uint8Array(0x1000 + 64).map((_, i) => i % 256);

  async function drop(user: ReturnType<typeof userEvent.setup>, chosen: File) {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, chosen);
  }

  it('reads a page and labels it with where it came from', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'file' });

    await drop(user, new File([big], 'sample.bin'));

    await waitFor(() => expect(dump()).toHaveTextContent('00000000 00 01 02 03 04 05 06 07'));
    // The separators are the reader's locale, not the page's: the offsets in
    // the dump itself stay hexadecimal.
    expect(screen.getByText(/showing bytes/)).toHaveTextContent(`0–${(4096).toLocaleString()}`);
  });

  it('moves through the file without reading all of it', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'file' });

    await drop(user, new File([big], 'sample.bin'));
    await waitFor(() => expect(dump()).toHaveTextContent('00000000'));

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(dump()).toHaveTextContent('00001000'));
    expect(screen.getByText(/page 2 of 2/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Last' }));
    await waitFor(() => expect(dump()).toHaveTextContent('00001000'));

    await user.click(screen.getByRole('button', { name: 'First' }));
    await waitFor(() => expect(dump()).toHaveTextContent('00000000'));
  });

  it('disables the ends of the file rather than walking off them', async () => {
    const user = userEvent.setup();
    render(HexDump, { source: 'file' });

    await drop(user, new File([big], 'sample.bin'));
    await waitFor(() => expect(dump()).toHaveTextContent('00000000'));

    expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('waits for a file rather than showing an empty dump', () => {
    render(HexDump, { source: 'file' });
    expect(dump()).toHaveTextContent('Drop a file to read it.');
  });
});
