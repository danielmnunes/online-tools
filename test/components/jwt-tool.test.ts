// @vitest-environment jsdom
/**
 * The JWT widget.
 *
 * The token below is the one in RFC 7515 §A.1, so the page is being checked
 * against a published value rather than against itself. Signature checking is
 * covered in jwt.test.ts, which runs where the Web Crypto API exists; what is
 * here is the reading: that the header and payload are shown as JSON, that the
 * time claims are turned into dates and distances, and that a token that is
 * expired says so.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import JwtTool from '~/components/widgets/JwtTool.svelte';

afterEach(cleanup);

/** RFC 7515 §A.1: issued by joe, expired in 2011. */
const TOKEN =
  'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
  '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
  '.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

async function paste(user: ReturnType<typeof userEvent.setup>, token: string) {
  await user.click(screen.getByLabelText('Token'));
  await user.paste(token);
}

/**
 * Set a long value the way the browser would.
 *
 * user-event types character by character, and these tests paste a 64-byte key
 * or a whole token: the point is what the widget does with the value, not how
 * it arrived.
 */
function set(label: string, value: string) {
  const field = screen.getByLabelText<HTMLTextAreaElement | HTMLInputElement>(label);
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('reading a token', () => {
  it('shows the header and the payload as JSON', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, TOKEN);

    await waitFor(() =>
      expect(screen.getByLabelText('Decoded header')).toHaveTextContent('"typ": "JWT"'),
    );
    expect(screen.getByLabelText('Decoded payload')).toHaveTextContent('"iss": "joe"');
    expect(screen.getByLabelText('Decoded payload')).toHaveTextContent(
      '"http://example.com/is_root": true',
    );
  });

  it('names the algorithm, and the type if there is one', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, TOKEN);
    await waitFor(() => expect(screen.getByText(/alg: HS256/)).toBeInTheDocument());
    expect(screen.getByText(/typ: JWT/)).toBeInTheDocument();
  });

  it('reads exp as a date and as a distance, and marks the token expired', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, TOKEN);

    await waitFor(() => expect(screen.getByText('exp', { selector: 'dt' })).toBeInTheDocument());
    const timing = screen.getByText('exp', { selector: 'dt' }).parentElement!;
    expect(timing).toHaveTextContent('expired');
    expect(timing).toHaveTextContent('2011-03-22T18:43:00.000Z');
    // Fifteen years is read in years, not in months.
    expect(timing).toHaveTextContent(/years ago/);
    expect(screen.getByText('expired')).toBeInTheDocument();
  });

  it('shows the signature as bytes, since it is not text', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, TOKEN);
    await waitFor(() =>
      expect(screen.getByText(/Signature \(32 bytes\)/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText('7418dfb49799e0254ffa607dd8adbbba16d4254d69d6bff05b58055853848d79'),
    ).toBeInTheDocument();
  });

  it('asks for a secret for an HMAC algorithm, and for a key otherwise', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, TOKEN);
    await waitFor(() => expect(screen.getByLabelText('Shared secret')).toBeInTheDocument());
    expect(screen.queryByLabelText(/Public key/)).toBeNull();
  });

  it('reports a secret that is not the encoding it was typed as', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, TOKEN);
    await waitFor(() => expect(screen.getByLabelText('Shared secret')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Secret encoding'), 'hex');
    await user.type(screen.getByLabelText('Shared secret'), 'abc');

    // Odd-length hex throws inside the check; the page has to say so rather
    // than leave the previous answer on screen and reject the promise.
    await waitFor(() =>
      expect(screen.getByText(/even number of digits/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Signature verified.')).toBeNull();
  });

  it('re-checks when the key changes, and drops the verdict when there is nothing to check', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, TOKEN);
    await waitFor(() => expect(screen.getByLabelText('Shared secret')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Shared secret'), 'wrong');
    await waitFor(() => expect(screen.getByText(/Not verified/)).toBeInTheDocument());

    // The 64-byte key from RFC 7515 §A.1, pasted as Base64: the same token
    // under the right key, which is the proof that the page re-checked rather
    // than keeping the answer it already had.
    await user.clear(screen.getByLabelText('Shared secret'));
    await user.selectOptions(screen.getByLabelText('Secret encoding'), 'base64');
    set(
      'Shared secret',
      'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow',
    );
    await waitFor(() => expect(screen.getByText('Signature verified.')).toBeInTheDocument());

    // And when the token stops parsing, the verdict goes with it: a stale
    // "verified" is the one wrong answer this page must not be able to give.
    set('Token', 'only.two');
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('Signature verified.')).toBeNull();
    expect(screen.queryByText(/Not verified/)).toBeNull();
    // Three verifications, each behind an await, do not fit in five seconds.
  }, 20000);

  it('reports a token that is not three segments, without decoding anything', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    await paste(user, 'only.two');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/three segments/));
  });

  it('says an unsigned token is unverifiable rather than valid', async () => {
    const user = userEvent.setup();
    render(JwtTool);

    // alg: none, empty signature.
    await paste(user, 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhIn0.');
    await waitFor(() => expect(screen.getByText(/alg: none/)).toBeInTheDocument());
    expect(screen.getByText(/Not verified/)).toBeInTheDocument();
    expect(screen.getByText(/unsigned/)).toBeInTheDocument();
  });
});
