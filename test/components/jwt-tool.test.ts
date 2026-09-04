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
