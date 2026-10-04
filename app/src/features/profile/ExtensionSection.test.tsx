import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '@/test/render';

const ext = vi.hoisted(() => ({
  listExtensionTokens: vi.fn(),
  createExtensionToken: vi.fn(),
  revokeExtensionToken: vi.fn(),
  isExtensionInstalled: vi.fn(),
}));
vi.mock('@/extension/api', () => ({
  listExtensionTokens: ext.listExtensionTokens,
  createExtensionToken: ext.createExtensionToken,
  revokeExtensionToken: ext.revokeExtensionToken,
}));
vi.mock('@/extension/bridge', () => ({ isExtensionInstalled: ext.isExtensionInstalled }));

import { ExtensionSection } from './ExtensionSection';

beforeEach(() => {
  Object.values(ext).forEach((m) => m.mockReset());
  ext.listExtensionTokens.mockResolvedValue([]);
  ext.isExtensionInstalled.mockResolvedValue(false);
});

describe('ExtensionSection', () => {
  it('says whether the extension is installed in this browser', async () => {
    ext.isExtensionInstalled.mockResolvedValue(true);
    renderWithProviders(<ExtensionSection />);
    expect(await screen.findByText(/installed in this browser/i)).toBeInTheDocument();
  });

  it('says when it was not found', async () => {
    renderWithProviders(<ExtensionSection />);
    expect(await screen.findByText(/was not found in this browser/i)).toBeInTheDocument();
  });

  it('shows a new token once, then hides it for good', async () => {
    ext.createExtensionToken.mockResolvedValue({
      id: 't1',
      token: 'cct_secret123',
      createdAt: '2026-01-01T00:00:00Z',
    });
    ext.listExtensionTokens.mockResolvedValue([
      { id: 't1', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null },
    ]);
    renderWithProviders(<ExtensionSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate token' }));

    const field = await screen.findByLabelText('Extension token');
    expect(field).toHaveValue('cct_secret123');
    expect(screen.getByText(/shown once/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /i’ve saved it/i }));
    expect(screen.queryByDisplayValue('cct_secret123')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('cct_secret123');
    // The token list never contains the secret.
    expect(await screen.findByRole('list', { name: 'Tokens' })).not.toHaveTextContent(
      'cct_secret123',
    );
  });

  it('does not keep the token in browser storage', async () => {
    ext.createExtensionToken.mockResolvedValue({
      id: 't1',
      token: 'cct_secret123',
      createdAt: '2026-01-01T00:00:00Z',
    });
    renderWithProviders(<ExtensionSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Generate token' }));
    await screen.findByLabelText('Extension token');
    expect(JSON.stringify({ ...localStorage })).not.toContain('cct_secret123');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('cct_secret123');
  });

  it('lists tokens with created and last used times', async () => {
    ext.listExtensionTokens.mockResolvedValue([
      { id: 't1', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null },
      { id: 't2', createdAt: '2026-01-02T00:00:00Z', lastUsedAt: '2026-01-03T00:00:00Z' },
    ]);
    renderWithProviders(<ExtensionSection />);
    const list = await screen.findByRole('list', { name: 'Tokens' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveTextContent('Last used never');
  });

  it('revokes a token after confirmation', async () => {
    ext.listExtensionTokens.mockResolvedValue([
      { id: 't1', createdAt: '2026-01-01T00:00:00Z', lastUsedAt: null },
    ]);
    ext.revokeExtensionToken.mockResolvedValue(undefined);
    renderWithProviders(<ExtensionSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog', { name: /revoke this token/i, hidden: true });
    expect(ext.revokeExtensionToken).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Revoke', hidden: true }));
    await waitFor(() => expect(ext.revokeExtensionToken).toHaveBeenCalledWith('t1'));
  });

  it('shows an error with a retry when tokens cannot be loaded', async () => {
    ext.listExtensionTokens.mockRejectedValueOnce(new Error('down')).mockResolvedValue([]);
    renderWithProviders(<ExtensionSection />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load tokens/i);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No tokens yet.')).toBeInTheDocument();
  });
});
