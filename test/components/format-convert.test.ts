// @vitest-environment jsdom
/**
 * Format and convert widgets.
 *
 * The algorithms have their own suite. What is here is the wiring: a verdict
 * for invalid JSON, a pretty-printed result when an option changes, a
 * structural diff that ignores key order, case conversion, and that a
 * timestamp shows Unix seconds and ISO 8601 together.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import FormatTool from '~/components/widgets/FormatTool.svelte';
import ConvertTool from '~/components/widgets/ConvertTool.svelte';

afterEach(cleanup);

async function pasteInto(label: string, text: string) {
  const user = userEvent.setup();
  const field = screen.getByLabelText(label);
  await user.click(field);
  await user.clear(field);
  await user.paste(text);
  return user;
}

describe('JSON validator', () => {
  it('says valid JSON is valid', async () => {
    render(FormatTool, { id: 'json-validator' });
    await pasteInto('JSON', '{"ok":true}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Valid JSON/));
  });

  it('reports a trailing comma rather than leaving a stale pass', async () => {
    render(FormatTool, { id: 'json-validator' });
    await pasteInto('JSON', '{"ok":true,}');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Not valid JSON/));
  });
});

describe('JSON formatter', () => {
  it('pretty-prints and recomputes when the indent changes', async () => {
    render(FormatTool, { id: 'json-formatter' });
    const user = await pasteInto('JSON', '{"a":1}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/"a": 1/));

    await user.selectOptions(screen.getByLabelText('Indent'), '4');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/ {4}"a": 1/));
  });
});

describe('JSON compare', () => {
  it('treats key order as irrelevant', async () => {
    render(FormatTool, { id: 'json-compare' });
    await pasteInto('Left', '{"a":1,"b":2}');
    await pasteInto('Right', '{"b":2,"a":1}');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/structurally identical/),
    );
  });

  it('names a changed path', async () => {
    render(FormatTool, { id: 'json-compare' });
    await pasteInto('Left', '{"a":1}');
    await pasteInto('Right', '{"a":2}');
    await waitFor(() => expect(screen.getByText('$.a')).toBeInTheDocument());
    expect(screen.getByText(/1 → 2|1 → 2/)).toBeInTheDocument();
  });
});

describe('JSON repair', () => {
  it('turns a JavaScript object literal into JSON.parse-able text', async () => {
    render(FormatTool, { id: 'json-repair' });
    await pasteInto('JSON', "{name: 'Ada'}");
    await waitFor(() => expect(screen.getByText(/Repaired\./)).toBeInTheDocument());
    expect(screen.getByText(/"name": "Ada"/)).toBeInTheDocument();
  });
});

describe('XML formatter', () => {
  it('indents a nested document', async () => {
    render(FormatTool, { id: 'xml-formatter' });
    await pasteInto('XML', '<root><item>one</item></root>');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/<item>one<\/item>/));
  });
});

describe('text compare', () => {
  it('marks an added line', async () => {
    render(FormatTool, { id: 'text-compare' });
    await pasteInto('Left', 'one');
    await pasteInto('Right', 'one\ntwo');
    await waitFor(() => expect(screen.getByText('two')).toBeInTheDocument());
    expect(screen.getByLabelText('Line-by-line diff')).toHaveTextContent('+');
  });
});

describe('camelCase converter', () => {
  it('joins snake_case and lists the other cases', async () => {
    render(ConvertTool, { id: 'case-camel' });
    await pasteInto('Text', 'hello_world');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('helloWorld'));
    expect(screen.getByText('snake_case').parentElement).toHaveTextContent('hello_world');
    expect(screen.getByText('PascalCase').parentElement).toHaveTextContent('HelloWorld');
  });
});

describe('time converter', () => {
  it('shows Unix seconds and ISO 8601 for a known instant', async () => {
    render(ConvertTool, { id: 'time' });
    await pasteInto('Timestamp or date', '1000000000');
    await waitFor(() => expect(screen.getByText('2001-09-09T01:46:40.000Z')).toBeInTheDocument());
    expect(screen.getByText('1000000000')).toBeInTheDocument();
  });
});
