// @vitest-environment jsdom
/**
 * The CBOR widget.
 *
 * The decoding is checked against RFC 8949 Appendix A in cbor.test.ts; what is
 * here is the page: that a pasted item shows all three views, that the two
 * directions are separate, and that a failure is reported in the widget rather
 * than thrown into the console.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import CborTool from '~/components/widgets/CborTool.svelte';

afterEach(cleanup);

/** Each of the three views is a labelled pre, so it can be found by name. */
function view(name: string): HTMLElement {
  return screen.getByLabelText(name);
}

describe('decoding', () => {
  it('shows an item in diagnostic notation, as JSON, and byte by byte', async () => {
    const user = userEvent.setup();
    render(CborTool);

    // A map of two pairs: {"a": 1, "b": [2, 3]}.
    await user.type(screen.getByLabelText('CBOR'), 'a26161016162820203');

    await waitFor(() => expect(view('Diagnostic notation')).toHaveTextContent('"a": 1'));
    expect(view('The same item as JSON')).toHaveTextContent('"b": [');
    expect(view('Byte by byte')).toHaveTextContent('Map (Length: 2 pairs)');
  });

  it('says what the bytes are, and what they saved against JSON', async () => {
    const user = userEvent.setup();
    render(CborTool);

    await user.type(screen.getByLabelText('CBOR'), 'a26161016162820203');
    await waitFor(() =>
      expect(screen.getByText(/9 bytes \(9 B\), \d+ bytes smaller than the same data as JSON/)).toBeInTheDocument(),
    );
  });

  it('says "larger" when the binary form is the bigger one', async () => {
    const user = userEvent.setup();
    render(CborTool);

    // A float64 for 1.0: nine bytes of CBOR against one byte of JSON.
    await user.type(screen.getByLabelText('CBOR'), 'fb3ff0000000000000');
    await waitFor(() =>
      expect(screen.getByText(/bytes larger than the same data as JSON/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/bytes smaller than/)).toBeNull();
  });

  it('reports input that is not CBOR instead of showing nothing', async () => {
    const user = userEvent.setup();
    render(CborTool);

    // A map promising two pairs with nothing after them.
    await user.type(screen.getByLabelText('CBOR'), 'a2');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Not valid CBOR/));
  });

  it('reports input that is not the encoding it was told it was', async () => {
    const user = userEvent.setup();
    render(CborTool);

    await user.type(screen.getByLabelText('CBOR'), 'zz');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/outside 0-9 and a-f/));
  });

  it('reads Base64 as well as hex', async () => {
    const user = userEvent.setup();
    render(CborTool);

    await user.selectOptions(screen.getByLabelText('Input encoding'), 'base64');
    // 0x83 0x01 0x02 0x03 is [1, 2, 3].
    await user.type(screen.getByLabelText('CBOR'), 'gwECAw');
    await waitFor(() => expect(view('Diagnostic notation')).toHaveTextContent('1'));
  });
});

describe('encoding', () => {
  it('encodes JSON and shows the bytes it produced', async () => {
    const user = userEvent.setup();
    const { container } = render(CborTool);

    await user.click(screen.getByRole('button', { name: 'Encode JSON' }));
    await user.clear(screen.getByLabelText('JSON'));
    await user.type(container.querySelector('#json-input')!, '{{"a":1}');

    // The default content encodes before anything is typed, so change it and
    // wait for the result to follow.
    await waitFor(() => expect(view('The CBOR bytes, in hex')).toHaveTextContent('a1616101'));
  });

  it('reports JSON that will not parse', async () => {
    const user = userEvent.setup();
    render(CborTool);

    await user.click(screen.getByRole('button', { name: 'Encode JSON' }));
    const input = screen.getByLabelText('JSON');
    await user.clear(input);
    await user.type(input, '{{"a": }');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Not valid JSON/));
  });

  it('sorts map keys only when determinism is asked for', async () => {
    const user = userEvent.setup();
    const { container } = render(CborTool);

    await user.click(screen.getByRole('button', { name: 'Encode JSON' }));
    await user.clear(screen.getByLabelText('JSON'));
    await user.type(container.querySelector('#json-input')!, '{{"b":1,"a":2}');
    await waitFor(() => expect(view('The CBOR bytes, in hex')).toHaveTextContent('a2616201616102'));

    await user.click(screen.getByLabelText(/Sort map keys/));
    await waitFor(() => expect(view('The CBOR bytes, in hex')).toHaveTextContent('a2616102616201'));
  });
});
