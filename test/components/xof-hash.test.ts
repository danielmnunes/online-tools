// @vitest-environment jsdom
/**
 * Behaviour of the XOF widget.
 *
 * The functions themselves are covered exhaustively in xof.test.ts. What is
 * tested here is the wiring: that a page renders exactly the controls its
 * function accepts, that the tuple editor is a tuple editor rather than a
 * text box, and that the parameters which change the answer do change it.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import XofHash from '~/components/widgets/XofHash.svelte';

afterEach(cleanup);

/** SHAKE128 of the empty string, 32 bytes — also cSHAKE128 with no strings. */
const SHAKE128_EMPTY = '7f9c2ba4e88f827d616045507605853ed73b8093f6efbc88eb1a6eacfa66ef26';

function output(): HTMLElement {
  return screen.getByRole('status');
}

describe('the controls each function gets', () => {
  it('gives SHAKE no key and no customization string', () => {
    render(XofHash, { algorithm: 'shake128' });
    expect(screen.queryByLabelText('Key')).toBeNull();
    expect(screen.queryByLabelText(/Customization string/)).toBeNull();
    expect(screen.queryByLabelText(/Block size/)).toBeNull();
  });

  it('gives cSHAKE a customization string and a function name, but no key', () => {
    render(XofHash, { algorithm: 'cshake128' });
    expect(screen.getByLabelText(/Customization string/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Function name/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Key')).toBeNull();
  });

  it('gives KMAC a key and a customization string, but no function name', () => {
    render(XofHash, { algorithm: 'kmac256' });
    expect(screen.getByLabelText('Key')).toBeInTheDocument();
    expect(screen.getByLabelText(/Customization string/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Function name/)).toBeNull();
  });

  it('gives ParallelHash a block size', () => {
    render(XofHash, { algorithm: 'parallelhash128' });
    expect(screen.getByLabelText(/Block size/)).toBeInTheDocument();
  });

  it('gives TupleHash a list editor rather than a text area', () => {
    render(XofHash, { algorithm: 'tuplehash128' });
    expect(screen.queryByLabelText('Input')).toBeNull();
    expect(screen.getByLabelText('Tuple element 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add element' })).toBeInTheDocument();
  });
});

describe('SHAKE', () => {
  it('computes on mount', async () => {
    render(XofHash, { algorithm: 'shake128' });
    await waitFor(() => expect(output()).toHaveTextContent(SHAKE128_EMPTY));
  });

  it('extends rather than replaces when the length grows', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'shake128' });
    await waitFor(() => expect(output()).toHaveTextContent(SHAKE128_EMPTY));

    const length = screen.getByLabelText('Output length');
    await user.clear(length);
    await user.type(length, '48');

    // A SHAKE is an XOF, so the 32-byte value must still be the prefix.
    await waitFor(() => {
      expect(output().textContent?.length).toBe(96);
      expect(output().textContent?.startsWith(SHAKE128_EMPTY)).toBe(true);
    });
  });
});

describe('cSHAKE', () => {
  it('equals SHAKE while both strings are empty, and says so', async () => {
    render(XofHash, { algorithm: 'cshake128' });
    await waitFor(() => expect(output()).toHaveTextContent(SHAKE128_EMPTY));
    expect(screen.getByText(/defines cSHAKE128 to be plain SHAKE128/)).toBeInTheDocument();
  });

  it('changes completely once a customization string is typed', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'cshake128' });
    await waitFor(() => expect(output()).toHaveTextContent(SHAKE128_EMPTY));

    await user.type(screen.getByLabelText(/Customization string/), 'Email Signature');
    await waitFor(() => expect(output()).not.toHaveTextContent(SHAKE128_EMPTY));
    expect(screen.queryByText(/defines cSHAKE128 to be plain SHAKE128/)).toBeNull();
  });

  it('reaches the NIST sample value for cSHAKE128', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'cshake128' });

    await user.selectOptions(screen.getByLabelText('Input encoding'), 'hex');
    await user.type(screen.getByLabelText('Input'), '00010203');
    await user.type(screen.getByLabelText(/Customization string/), 'Email Signature');

    await waitFor(() =>
      expect(output()).toHaveTextContent(
        'c1c36925b6409a04f1b504fcbca9d82b4017277cb5ed2b2065fc1d3814d5aaf5',
      ),
    );
  });
});

describe('KMAC', () => {
  it('recomputes when the key changes', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'kmac128' });

    await user.type(screen.getByLabelText('Key'), 'first');
    let first = '';
    await waitFor(() => {
      first = output().textContent ?? '';
      expect(first.length).toBe(64);
    });

    await user.clear(screen.getByLabelText('Key'));
    await user.type(screen.getByLabelText('Key'), 'second');
    await waitFor(() => expect(output().textContent).not.toBe(first));
  });

  it('shows the key size in bytes as the encoding changes', async () => {
    const user = userEvent.setup();
    const { container } = render(XofHash, { algorithm: 'kmac128' });

    // The size hint is split across text nodes, so match on the paragraph.
    const sizes = () =>
      [...container.querySelectorAll('p')].map((p) => p.textContent ?? '').join(' | ');

    await user.type(screen.getByLabelText('Key'), '61626364');
    await waitFor(() => expect(sizes()).toMatch(/8 bytes/));

    await user.selectOptions(screen.getAllByLabelText('Encoding')[0]!, 'hex');
    await waitFor(() => expect(sizes()).toMatch(/4 bytes/));
  });
});

describe('TupleHash', () => {
  it('distinguishes tuples that concatenate to the same bytes', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'tuplehash128' });

    await user.click(screen.getByRole('button', { name: 'Add element' }));
    await user.type(screen.getByLabelText('Tuple element 1'), 'ab');
    await user.type(screen.getByLabelText('Tuple element 2'), 'cd');

    let first = '';
    await waitFor(() => {
      first = output().textContent ?? '';
      expect(first.length).toBe(64);
    });

    await user.clear(screen.getByLabelText('Tuple element 1'));
    await user.type(screen.getByLabelText('Tuple element 1'), 'a');
    await user.clear(screen.getByLabelText('Tuple element 2'));
    await user.type(screen.getByLabelText('Tuple element 2'), 'bcd');

    await waitFor(() => {
      const second = output().textContent ?? '';
      expect(second.length).toBe(64);
      expect(second).not.toBe(first);
    });
  });

  it('keeps at least one element and re-enables removal above one', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'tuplehash256' });

    expect(screen.getByRole('button', { name: 'Remove element 1' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Add element' }));
    expect(screen.getByRole('button', { name: 'Remove element 1' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Remove element 2' }));
    expect(screen.queryByLabelText('Tuple element 2')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove element 1' })).toBeDisabled();
  });
});

describe('errors', () => {
  it('reports a decoding error instead of showing a stale digest', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'shake256' });
    await waitFor(() => expect(output().textContent?.length).toBe(128));

    await user.selectOptions(screen.getByLabelText('Input encoding'), 'hex');
    await user.type(screen.getByLabelText('Input'), 'zz');

    await waitFor(() => expect(output()).toHaveTextContent(/outside 0-9 and a-f/));
  });

  it('reports an out-of-range output length rather than computing', async () => {
    const user = userEvent.setup();
    render(XofHash, { algorithm: 'shake128' });
    await waitFor(() => expect(output()).toHaveTextContent(SHAKE128_EMPTY));

    const length = screen.getByLabelText('Output length');
    await user.clear(length);
    await user.type(length, '0');

    await waitFor(() => expect(output()).toHaveTextContent(/produces 1 to/));
  });
});
