// @vitest-environment jsdom
/**
 * The URL parser widget.
 *
 * The parsing itself is the browser's and is covered in url-parser.test.ts;
 * what is here is that the page shows it: the components, the query parameters
 * with both their raw and decoded forms, and the observations that are the
 * reason to have a page for this at all.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import UrlParser from '~/components/widgets/UrlParser.svelte';

afterEach(cleanup);

async function type(user: ReturnType<typeof userEvent.setup>, url: string) {
  const input = screen.getByLabelText('URL');
  await user.clear(input);
  await user.type(input, url);
  return input;
}

describe('the parts', () => {
  it('shows the components of what was typed', async () => {
    const user = userEvent.setup();
    render(UrlParser);

    await type(user, 'https://example.com:8443/a/b?q=1');

    await waitFor(() => expect(screen.getByText('protocol')).toBeInTheDocument());
    const row = (term: string): HTMLElement =>
      screen.getByText(term, { selector: 'dt' }).parentElement!;
    expect(row('protocol')).toHaveTextContent('https:');
    expect(row('hostname')).toHaveTextContent('example.com');
    expect(row('port')).toHaveTextContent('8443');
    expect(row('pathname')).toHaveTextContent('/a/b');
  });

  it('shows query parameters decoded, and as they were written', async () => {
    const user = userEvent.setup();
    render(UrlParser);

    await type(user, 'https://example.com/?q=hello%20world&plain=1');

    await waitFor(() => expect(screen.getByText('Query parameters (2)')).toBeInTheDocument());
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('hello world');
    // The raw column is what would have to be sent again to mean the same.
    expect(table).toHaveTextContent('hello%20world');
  });

  it('says so when there is no query string', async () => {
    const user = userEvent.setup();
    render(UrlParser);

    await type(user, 'https://example.com/a');
    await waitFor(() => expect(screen.getByText(/no query string/)).toBeInTheDocument());
  });
});

describe('what it says about the URL', () => {
  const notes = (): string => screen.getByText('Worth knowing').parentElement!.textContent ?? '';

  it('explains the port that is not in the string', async () => {
    const user = userEvent.setup();
    render(UrlParser);

    await type(user, 'https://example.com/');
    await waitFor(() => expect(notes()).toMatch(/No port is shown because/));
  });

  it('warns about a password in the URL', async () => {
    const user = userEvent.setup();
    render(UrlParser);

    await type(user, 'https://user:hunter2@example.com/');
    await waitFor(() => expect(notes()).toMatch(/password/));
  });
});

describe('input that is not a URL', () => {
  it('tells you to add a scheme, which is the usual mistake', async () => {
    const user = userEvent.setup();
    render(UrlParser);

    await type(user, 'example.com/path');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/has no scheme/));
  });
});
