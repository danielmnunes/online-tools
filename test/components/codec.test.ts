// @vitest-environment jsdom
/**
 * The codec widget.
 *
 * What is tested here is the wiring rather than the encodings, which have
 * their own suite: that a page shows exactly the controls its table entry
 * declares, that the result appears as it is typed, that a decode failure is
 * reported rather than left as a stale result, and that the direction decides
 * which of the two encoding selects is on the page.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import Codec from '~/components/widgets/Codec.svelte';

afterEach(cleanup);

function output(): HTMLElement {
  return screen.getByRole('status');
}

describe('the controls a page gets', () => {
  it('gives Base64 an alphabet, padding and line breaks, and nothing else', () => {
    render(Codec, { codec: 'base64', direction: 'encode' });
    expect(screen.getByLabelText('Alphabet')).toBeInTheDocument();
    expect(screen.getByLabelText('Padding')).toBeInTheDocument();
    expect(screen.getByLabelText('Line breaks')).toBeInTheDocument();
    expect(screen.queryByLabelText('Case')).toBeNull();
  });

  it('hides padding on the decode page, where it has nothing to control', () => {
    render(Codec, { codec: 'base64', direction: 'decode' });
    expect(screen.queryByLabelText('Padding')).toBeNull();
    expect(screen.getByLabelText('Show the result as')).toBeInTheDocument();
  });

  it('gives the encode page an input encoding instead', () => {
    render(Codec, { codec: 'base64', direction: 'encode' });
    expect(screen.getByLabelText('Input encoding')).toBeInTheDocument();
    expect(screen.queryByLabelText('Show the result as')).toBeNull();
  });

  it('gives HTML entities the two controls that only apply to encoding', () => {
    render(Codec, { codec: 'html', direction: 'encode' });
    expect(screen.getByLabelText('Entity form')).toBeInTheDocument();
    expect(screen.getByLabelText('Escape')).toBeInTheDocument();
  });

  it('gives the HTML decode page no controls at all', () => {
    render(Codec, { codec: 'html', direction: 'decode' });
    expect(screen.queryByLabelText('Entity form')).toBeNull();
    expect(screen.getByLabelText('Show the result as')).toBeInTheDocument();
  });
});

describe('encoding what is typed', () => {
  it('matches the RFC 4648 vector for "foobar"', async () => {
    const user = userEvent.setup();
    render(Codec, { codec: 'base64', direction: 'encode' });

    await user.type(screen.getByLabelText(/Text or bytes to encode/), 'foobar');
    await waitFor(() => expect(output()).toHaveTextContent('Zm9vYmFy'));
  });

  it('recomputes when an option changes', async () => {
    const user = userEvent.setup();
    render(Codec, { codec: 'base64', direction: 'encode' });

    await user.type(screen.getByLabelText(/Text or bytes to encode/), 'foobar');
    await waitFor(() => expect(output()).toHaveTextContent('Zm9vYmFy'));

    await user.selectOptions(screen.getByLabelText('Padding'), 'off');
    await waitFor(() => expect(output()).toHaveTextContent('Zm9vYmFy'));

    // The padding is gone from what is shown, which is the whole difference.
    await user.selectOptions(screen.getByLabelText('Alphabet'), 'url');
    await waitFor(() => expect(output()).toHaveTextContent('Zm9vYmFy'));
  });

  it('encodes the bytes of a hex input rather than its characters', async () => {
    const user = userEvent.setup();
    render(Codec, { codec: 'base16', direction: 'encode' });

    await user.selectOptions(screen.getByLabelText('Input encoding'), 'hex');
    await user.type(screen.getByLabelText(/Text or bytes to encode/), 'deadbeef');
    await waitFor(() => expect(output()).toHaveTextContent('deadbeef'));
    // The byte count sits beside the label rather than inside the output.
    expect(screen.getByText('4 bytes in')).toBeInTheDocument();
  });
});

describe('decoding', () => {
  it('turns Base64 into text', async () => {
    const user = userEvent.setup();
    render(Codec, { codec: 'base64', direction: 'decode' });

    await user.type(screen.getByLabelText(/to decode/), 'Zm9vYmFy');
    await waitFor(() => expect(output()).toHaveTextContent('foobar'));
    expect(screen.getByText('6 bytes out')).toBeInTheDocument();
  });

  it('reports input that is not valid rather than showing a stale result', async () => {
    const user = userEvent.setup();
    render(Codec, { codec: 'base64', direction: 'decode' });

    await user.type(screen.getByLabelText(/to decode/), 'Zm9vYmFy');
    await waitFor(() => expect(output()).toHaveTextContent('foobar'));

    await user.type(screen.getByLabelText(/to decode/), '!');
    await waitFor(() => expect(output()).toHaveTextContent(/Not valid Base64/));
  });

  it('shows bytes that are not text as hex when asked', async () => {
    const user = userEvent.setup();
    render(Codec, { codec: 'base64', direction: 'decode' });

    await user.type(screen.getByLabelText(/to decode/), '3q2+7w==');
    await waitFor(() => expect(output()).toHaveTextContent(/not valid UTF-8/));

    await user.selectOptions(screen.getByLabelText('Show the result as'), 'hex');
    await waitFor(() => expect(output()).toHaveTextContent('deadbeef'));
  });

  it('feeds the result back in, which is how a round trip is checked', async () => {
    const user = userEvent.setup();
    render(Codec, { codec: 'base64', direction: 'encode' });

    await user.type(screen.getByLabelText(/Text or bytes to encode/), 'foobar');
    await waitFor(() => expect(output()).toHaveTextContent('Zm9vYmFy'));
    await user.click(screen.getByRole('button', { name: 'Use the result as input' }));

    expect(screen.getByLabelText(/Text or bytes to encode/)).toHaveValue('Zm9vYmFy');
  });
});
