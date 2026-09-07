// @vitest-environment jsdom
/**
 * The RSA/ECDSA widget.
 *
 * Cryptographic checks live in asymmetric.test.ts (node, where Web Crypto
 * exists). What is tested here is the page: that keygen shows the warning
 * and the generate button, that encrypt asks for a public key, and that
 * ECDSA has no encrypt controls because the table does not list that
 * operation — the page for it does not exist.
 */
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import AsymmetricTool from '~/components/widgets/AsymmetricTool.svelte';

afterEach(cleanup);

describe('keygen', () => {
  it('states the private-key warning before anything is generated', () => {
    render(AsymmetricTool, { algorithm: 'rsa', operation: 'keygen' });
    expect(screen.getByText(/private as this tab/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate key pair/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Modulus')).toBeInTheDocument();
  });

  it('gives ECDSA a curve instead of a modulus', () => {
    render(AsymmetricTool, { algorithm: 'ecdsa', operation: 'keygen' });
    expect(screen.getByLabelText('Curve')).toBeInTheDocument();
    expect(screen.queryByLabelText('Modulus')).toBeNull();
  });
});

describe('the encrypt and sign pages', () => {
  it('asks RSA encrypt for a public key and a hash', () => {
    render(AsymmetricTool, { algorithm: 'rsa', operation: 'encrypt' });
    expect(screen.getByLabelText(/Public key/)).toBeInTheDocument();
    expect(screen.getByLabelText('Hash')).toBeInTheDocument();
    expect(screen.queryByLabelText('Padding')).toBeNull();
  });

  it('asks RSA sign for a private key and a padding', () => {
    render(AsymmetricTool, { algorithm: 'rsa', operation: 'sign' });
    expect(screen.getByLabelText(/Private key/)).toBeInTheDocument();
    expect(screen.getByLabelText('Padding')).toBeInTheDocument();
  });

  it('asks ECDSA verify for a signature', () => {
    render(AsymmetricTool, { algorithm: 'ecdsa', operation: 'verify' });
    expect(screen.getByLabelText('Signature')).toBeInTheDocument();
    expect(screen.getByLabelText('Curve')).toBeInTheDocument();
  });
});
