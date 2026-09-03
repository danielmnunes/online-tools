// @vitest-environment jsdom
/**
 * Behaviour of the text hashing widget.
 *
 * The algorithms themselves are covered exhaustively elsewhere. What is tested
 * here is the wiring nobody else checks: that changing an option recomputes,
 * that a bad input surfaces as an error rather than a stale digest, and that
 * out-of-order async results cannot overwrite a newer one.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import TextHash from '~/components/widgets/TextHash.svelte';

afterEach(cleanup);

const MD5_ABC = '900150983cd24fb0d6963f7d28e17f72';
const MD5_EMPTY = 'd41d8cd98f00b204e9800998ecf8427e';

function output(): HTMLElement {
  return screen.getByRole('status');
}

describe('TextHash', () => {
  it('hashes the empty input on mount', async () => {
    render(TextHash, { algorithm: 'md5' });
    await waitFor(() => expect(output()).toHaveTextContent(MD5_EMPTY));
  });

  it('recomputes as the user types', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'md5' });

    await user.type(screen.getByLabelText('Input'), 'abc');
    await waitFor(() => expect(output()).toHaveTextContent(MD5_ABC));
  });

  it('recomputes when the output encoding changes', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'md5' });
    await user.type(screen.getByLabelText('Input'), 'abc');
    await waitFor(() => expect(output()).toHaveTextContent(MD5_ABC));

    await user.selectOptions(screen.getByLabelText('Output encoding'), 'base64');
    // Base64 of the same digest bytes.
    await waitFor(() => expect(output()).toHaveTextContent('kAFQmDzST7DWlj99KOF/cg=='));
  });

  it('treats the input as bytes when the input encoding says so', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'md5' });

    await user.selectOptions(screen.getByLabelText('Input encoding'), 'hex');
    await user.type(screen.getByLabelText('Input'), '616263');
    // 61 62 63 is "abc", so this must equal the digest of the text abc.
    await waitFor(() => expect(output()).toHaveTextContent(MD5_ABC));
  });

  it('reports a decoding error instead of showing a stale digest', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'md5' });
    await user.type(screen.getByLabelText('Input'), 'abc');
    await waitFor(() => expect(output()).toHaveTextContent(MD5_ABC));

    await user.selectOptions(screen.getByLabelText('Input encoding'), 'hex');
    await waitFor(() => expect(output()).toHaveTextContent(/even number of digits/i));
    expect(output()).not.toHaveTextContent(MD5_ABC);
  });

  it('switches to HMAC when the box is ticked', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'md5' });
    await user.type(screen.getByLabelText('Input'), 'Hi There');

    await user.click(screen.getByLabelText('HMAC'));
    await user.selectOptions(screen.getByLabelText('Key encoding'), 'hex');
    await user.type(screen.getByLabelText('HMAC key'), '0b'.repeat(16));

    // RFC 2202 test case 1.
    await waitFor(() => expect(output()).toHaveTextContent('9294727a3638bb1c13f48ef8158bfc9d'));
  });

  it('settles on the digest of the final input after rapid edits', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'md5' });
    const input = screen.getByLabelText('Input');

    // Each keystroke starts an async hash. Whichever resolves last must not
    // win -- only the newest run may write the output.
    await user.type(input, 'abcdef');
    await user.clear(input);
    await user.type(input, 'abc');

    await waitFor(() => expect(output()).toHaveTextContent(MD5_ABC));
    // Give any in-flight stale run time to land, then confirm it did not.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(output()).toHaveTextContent(MD5_ABC);
  });

  it('hides the HMAC option for algorithms that do not offer it', () => {
    render(TextHash, { algorithm: 'blake3' });
    expect(screen.queryByLabelText('HMAC')).toBeNull();
  });

  it('offers no key or length control at all for a fixed algorithm', () => {
    render(TextHash, { algorithm: 'md5' });
    expect(screen.queryByLabelText('Keyed')).toBeNull();
    expect(screen.queryByLabelText('Output length')).toBeNull();
  });
});

/**
 * The BLAKE family is keyed directly rather than through HMAC, and chooses its
 * own digest length. Both are offered by the same widget, so both need to be
 * shown to actually reach the algorithm and not merely render.
 */
describe('TextHash with a natively keyed algorithm', () => {
  // OpenSSL: openssl mac -macopt hexkey:<KEY> -macopt size:64 BLAKE2BMAC
  const KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
  const KEYED_ABC =
    '9af0244b7da7fe29d90a89727e06a0c93977ce1ad7edcb76ac0b24142194ea00' +
    'c77be4a1d3fededd31d5a593625a508e742fc90d708f8b48a5c246e4e8e42d94';
  // b2sum -l 256
  const ABC_32_BYTES = 'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319';

  it('offers a key rather than HMAC', () => {
    render(TextHash, { algorithm: 'blake2b' });
    expect(screen.queryByLabelText('HMAC')).toBeNull();
    expect(screen.getByLabelText('Keyed')).toBeInTheDocument();
  });

  it('hashes with the key the user supplies', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'blake2b' });
    await user.type(screen.getByLabelText('Input'), 'abc');

    await user.click(screen.getByLabelText('Keyed'));
    await user.selectOptions(screen.getByLabelText('Key encoding'), 'hex');
    await user.type(screen.getByLabelText('Key'), KEY);

    await waitFor(() => expect(output()).toHaveTextContent(KEYED_ABC));
  });

  it('recomputes at the length the user asks for', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'blake2b' });
    await user.type(screen.getByLabelText('Input'), 'abc');

    const length = screen.getByLabelText('Output length');
    await user.clear(length);
    await user.type(length, '32');

    await waitFor(() => expect(output()).toHaveTextContent(ABC_32_BYTES));
    expect(screen.getByText('256 bits')).toBeInTheDocument();
  });

  it('reports an unusable key instead of falling back to an unkeyed digest', async () => {
    const user = userEvent.setup();
    render(TextHash, { algorithm: 'blake3' });
    await user.type(screen.getByLabelText('Input'), 'abc');

    await user.click(screen.getByLabelText('Keyed'));
    // BLAKE3 fixes its key at 32 bytes; four is not a length it accepts.
    await user.type(screen.getByLabelText('Key'), '四');

    await waitFor(() => expect(output()).toHaveTextContent(/needs a key of exactly 32 bytes/));
    expect(output()).not.toHaveTextContent(
      '6437b3ac38465133ffb63b75273a8db548c558465d79db03fd359c6cd5bd9d85',
    );
  });
});
