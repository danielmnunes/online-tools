// @vitest-environment jsdom
/**
 * Generator widgets.
 *
 * The algorithms have their own suite. What is here is the wiring: a v4 UUID
 * appears on load, a v5 UUID is the namespace-only hash until a name is typed
 * (then the RFC vector), a password has the requested length, and a QR code
 * becomes an SVG.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import GeneratorTool from '~/components/widgets/GeneratorTool.svelte';

afterEach(cleanup);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('UUID v4', () => {
  it('shows a version-4 UUID on load', async () => {
    render(GeneratorTool, { id: 'uuid-v4' });
    await waitFor(() => {
      const text = screen.getByRole('status').textContent ?? '';
      expect(text).toMatch(UUID_RE);
      expect(text).toMatch(/^........-....-4/);
    });
  });
});

describe('UUID v5', () => {
  it('hashes the DNS namespace alone when the name is empty', async () => {
    render(GeneratorTool, { id: 'uuid-v5' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('4ebd0208-8328-5d69-8c44-ec50939c0967'),
    );
  });

  it('recomputes the RFC 9562 DNS vector from the name', async () => {
    render(GeneratorTool, { id: 'uuid-v5' });
    const user = userEvent.setup();
    const field = screen.getByLabelText('Name');
    await user.click(field);
    await user.paste('www.example.com');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('2ed6657d-e927-568b-95e1-2665a8aea6a2'),
    );
  });
});

describe('password generator', () => {
  it('emits a 20-character password from the default alphabet', async () => {
    render(GeneratorTool, { id: 'password' });
    await waitFor(() => {
      const text = (screen.getByRole('status').textContent ?? '').trim();
      expect(text.length).toBe(20);
    });
    expect(screen.getByText(/bits/)).toBeInTheDocument();
  });
});

describe('QR generator', () => {
  it('draws an SVG for typed text', async () => {
    render(GeneratorTool, { id: 'qr' });
    const user = userEvent.setup();
    const field = screen.getByLabelText('Text');
    await user.click(field);
    await user.paste('https://example.com');
    await waitFor(() => expect(screen.getByLabelText('QR code').querySelector('svg')).toBeTruthy());
  });
});
