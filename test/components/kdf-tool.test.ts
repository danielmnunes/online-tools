// @vitest-environment jsdom
/**
 * Behaviour of the key-derivation widget.
 *
 * jsdom has no Worker, so the pool's inline fallback is what runs here — which
 * is deliberate: it means these tests exercise the same deriveKey path the
 * browser does, one thread further in.
 *
 * What is tested is the wiring: that a page shows exactly the fields its
 * algorithm takes, that nothing runs until the button is pressed, and that a
 * verify page reports which parameters it actually used.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import KdfTool from '~/components/widgets/KdfTool.svelte';

afterEach(cleanup);

function output(): HTMLElement {
  return screen.getByRole('status');
}

/** Fills the cost fields with values small enough for a test to wait on. */
async function setCost(user: ReturnType<typeof userEvent.setup>, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
  }
}

describe('the fields each algorithm gets', () => {
  it('gives PBKDF2 a hash, an iteration count and a salt', () => {
    render(KdfTool, { algorithm: 'pbkdf2', mode: 'derive' });
    expect(screen.getByLabelText('Underlying hash')).toBeInTheDocument();
    expect(screen.getByLabelText('Iterations')).toBeInTheDocument();
    expect(screen.getByLabelText('Salt')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Info/)).toBeNull();
  });

  it('gives HKDF an info string and an optional salt', () => {
    render(KdfTool, { algorithm: 'hkdf', mode: 'derive' });
    expect(screen.getByLabelText(/Info/)).toBeInTheDocument();
    expect(screen.getByLabelText('Salt (optional)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Iterations')).toBeNull();
  });

  it('gives scrypt N, r and p but no hash', () => {
    render(KdfTool, { algorithm: 'scrypt', mode: 'derive' });
    expect(screen.getByLabelText('N (cost)')).toBeInTheDocument();
    expect(screen.getByLabelText('r (block size)')).toBeInTheDocument();
    expect(screen.getByLabelText('p (parallelism)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Underlying hash')).toBeNull();
  });

  it('gives Argon2 its three knobs plus the secret and associated data', () => {
    render(KdfTool, { algorithm: 'argon2id', mode: 'derive' });
    expect(screen.getByLabelText('t (iterations)')).toBeInTheDocument();
    expect(screen.getByLabelText('m (memory, KiB)')).toBeInTheDocument();
    expect(screen.getByLabelText('p (parallelism)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Secret key/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Associated data/)).toBeInTheDocument();
  });

  it('gives bcrypt a cost and no output length, because it has none to give', () => {
    render(KdfTool, { algorithm: 'bcrypt', mode: 'derive' });
    expect(screen.getByLabelText('Cost')).toBeInTheDocument();
    expect(screen.queryByLabelText('Output length')).toBeNull();
  });
});

describe('running the derivation', () => {
  it('does nothing until the button is pressed', async () => {
    render(KdfTool, { algorithm: 'pbkdf2', mode: 'derive' });
    // Everything else on this site computes on mount. These must not.
    expect(output()).toHaveTextContent('Result appears here.');
  });

  it('derives a PBKDF2 key matching the RFC 6070 vector', async () => {
    const user = userEvent.setup();
    render(KdfTool, { algorithm: 'pbkdf2', mode: 'derive' });

    await user.type(screen.getByLabelText('Password'), 'password');
    await user.type(screen.getByLabelText('Salt'), 'salt');
    await setCost(user, { Iterations: '2' });
    const length = screen.getByLabelText('Output length');
    await user.clear(length);
    await user.type(length, '20');
    await user.selectOptions(screen.getByLabelText('Underlying hash'), 'sha1');

    await user.click(screen.getByRole('button', { name: /Derive with PBKDF2/ }));
    await waitFor(
      () => expect(output()).toHaveTextContent('ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957'),
      { timeout: 5000 },
    );
  });

  it('shows the storage string alongside the raw bytes', async () => {
    const user = userEvent.setup();
    render(KdfTool, { algorithm: 'argon2id', mode: 'derive' });

    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.type(screen.getByLabelText('Salt'), 'saltsaltsaltsalt');
    await setCost(user, { 't (iterations)': '1', 'm (memory, KiB)': '32', 'p (parallelism)': '1' });

    await user.click(screen.getByRole('button', { name: /Derive with Argon2id/ }));
    await waitFor(
      () => expect(screen.getByText(/^\$argon2id\$v=19\$m=32,t=1,p=1\$/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it('reports an error from the algorithm rather than a blank result', async () => {
    const user = userEvent.setup();
    render(KdfTool, { algorithm: 'scrypt', mode: 'derive' });

    await user.type(screen.getByLabelText('Password'), 'x');
    await user.type(screen.getByLabelText('Salt'), 'y');
    await setCost(user, { 'N (cost)': '1000', 'r (block size)': '1', 'p (parallelism)': '1' });

    await user.click(screen.getByRole('button', { name: /Derive with scrypt/ }));
    await waitFor(() => expect(output()).toHaveTextContent(/power of two; 1000 is not/), {
      timeout: 5000,
    });
  });

  it('generates a salt of the right size', async () => {
    const user = userEvent.setup();
    const { container } = render(KdfTool, { algorithm: 'bcrypt', mode: 'derive' });

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    const salt = screen.getByLabelText('Salt') as HTMLInputElement;
    expect(salt.value).toMatch(/^[0-9a-f]{32}$/);
    const sizes = [...container.querySelectorAll('p')].map((p) => p.textContent ?? '').join(' | ');
    expect(sizes).toMatch(/16 bytes/);
  });
});

describe('verify mode', () => {
  it('asks for a stored hash instead of showing one', () => {
    render(KdfTool, { algorithm: 'bcrypt', mode: 'verify' });
    expect(screen.getByLabelText('Stored hash or derived key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check the password' })).toBeInTheDocument();
  });

  it('hides the salt field for bcrypt, whose hash carries its own', () => {
    render(KdfTool, { algorithm: 'bcrypt', mode: 'verify' });
    expect(screen.queryByLabelText('Salt')).toBeNull();
  });

  it('accepts the right password against a published bcrypt hash', async () => {
    const user = userEvent.setup();
    render(KdfTool, { algorithm: 'bcrypt', mode: 'verify' });

    await user.type(screen.getByLabelText('Password'), 'abc');
    await user.type(
      screen.getByLabelText('Stored hash or derived key'),
      '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i',
    );
    await user.click(screen.getByRole('button', { name: 'Check the password' }));

    await waitFor(() => expect(screen.getByText(/Match/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/2a, cost=6/)).toBeInTheDocument();
  });

  it('rejects the wrong password and says so plainly', async () => {
    const user = userEvent.setup();
    render(KdfTool, { algorithm: 'bcrypt', mode: 'verify' });

    await user.type(screen.getByLabelText('Password'), 'abd');
    await user.type(
      screen.getByLabelText('Stored hash or derived key'),
      '$2a$06$If6bvum7DFjUnE9p2uDeDu0YHzrHM6tf.iqN8.yx.jNN1ILEf7h0i',
    );
    await user.click(screen.getByRole('button', { name: 'Check the password' }));

    await waitFor(() => expect(screen.getByText('No match.')).toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  it('says the parameters came from the hash, not the form', async () => {
    const user = userEvent.setup();
    render(KdfTool, { algorithm: 'argon2id', mode: 'verify' });

    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.type(
      screen.getByLabelText('Stored hash or derived key'),
      // Argon2id of "hunter2" with that salt at m=32, t=1, p=1, 16 bytes out.
      '$argon2id$v=19$m=32,t=1,p=1$c2FsdHNhbHRzYWx0c2FsdA$9Blw+wCv+clVLwoh3+XozQ',
    );
    await user.click(screen.getByRole('button', { name: 'Check the password' }));

    await waitFor(() => expect(screen.getByText(/^Match/)).toBeInTheDocument(), { timeout: 5000 });
    // The form still says t=2, m=19456: the string's parameters are the ones used.
    expect(screen.getByText(/m=32, t=1, p=1/)).toBeInTheDocument();
    expect(screen.getByText(/read from\s+the hash itself/)).toBeInTheDocument();
  });

  it('refuses an empty expected value with a usable message', async () => {
    const user = userEvent.setup();
    render(KdfTool, { algorithm: 'scrypt', mode: 'verify' });

    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Check the password' }));

    await waitFor(() => expect(output()).toHaveTextContent(/Paste the hash/), { timeout: 5000 });
  });
});
