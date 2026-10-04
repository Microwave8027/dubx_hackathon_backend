import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { approval, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { useToastStore } from '@/state/toastStore';
import { ApprovalsList } from './ApprovalsList';

const api = vi.hoisted(() => ({
  listApprovals: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
}));
vi.mock('@/api/client', () => ({ api }));

const two = () => [
  approval({ id: 'a1', action: { category: 'send_message', summary: 'Send the email' } }),
  approval({
    id: 'a2',
    createdAt: '2026-01-01T00:00:01.000Z',
    action: { category: 'install_software', summary: 'Install a font' },
  }),
];

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listApprovals.mockImplementation(async () => two());
  useToastStore.setState({ toasts: [] });
  useLiveStore.setState({ tasks: { t1: task() }, layers: {}, approvals: {} });
});

describe('ApprovalsList', () => {
  it('states the action in plain language with category and layer, and does not autofocus', async () => {
    renderWithProviders(<ApprovalsList />);
    const card = await screen.findByRole('article', { name: 'Send the email' });
    expect(card).toHaveTextContent('While working on “Organize Downloads”, the layer wants to:');
    expect(card).toHaveTextContent('Send the email');
    expect(card).toHaveTextContent('Send a message');
    expect(within(card).getByRole('link', { name: /Layer: Organize Downloads/ })).toHaveAttribute(
      'href',
      '/layers/l1',
    );
    expect(document.body).toHaveFocus();
    expect(screen.getAllByRole('button', { name: 'Approve' })[0]).not.toHaveFocus();
  });

  it('approves optimistically', async () => {
    api.approve.mockResolvedValue(approval({ id: 'a1', status: 'approved' }));
    renderWithProviders(<ApprovalsList />);
    await screen.findByRole('article', { name: 'Send the email' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    expect(api.approve).toHaveBeenCalledWith('a1');
    expect(screen.queryByRole('article', { name: 'Send the email' })).not.toBeInTheDocument();
  });

  it('rolls back and shows a toast when the API fails', async () => {
    api.deny.mockRejectedValue(new Error('500'));
    renderWithProviders(<ApprovalsList />);
    await screen.findByRole('article', { name: 'Send the email' });
    await userEvent.click(screen.getAllByRole('button', { name: 'Deny' })[0]!);
    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0]?.kind).toBe('error');
    expect(screen.getByRole('article', { name: 'Send the email' })).toBeInTheDocument();
  });

  it('shortcuts: j/k move, a approves the selected one, d denies', async () => {
    api.approve.mockResolvedValue(approval({ id: 'a2', status: 'approved' }));
    api.deny.mockResolvedValue(approval({ id: 'a1', status: 'denied' }));
    renderWithProviders(<ApprovalsList />);
    await screen.findByRole('article', { name: 'Send the email' });
    expect(screen.getByRole('article', { name: 'Send the email' })).toHaveAttribute(
      'data-selected',
      'true',
    );

    await userEvent.keyboard('j');
    expect(screen.getByRole('article', { name: 'Install a font' })).toHaveAttribute(
      'data-selected',
      'true',
    );
    await userEvent.keyboard('k');
    expect(screen.getByRole('article', { name: 'Send the email' })).toHaveAttribute(
      'data-selected',
      'true',
    );
    await userEvent.keyboard('j');
    await userEvent.keyboard('a');
    expect(api.approve).toHaveBeenCalledWith('a2');
    await userEvent.keyboard('d');
    expect(api.deny).toHaveBeenCalledWith('a1');
  });

  it('ignores shortcuts while typing', async () => {
    renderWithProviders(
      <>
        <input aria-label="note" />
        <ApprovalsList />
      </>,
    );
    await screen.findByRole('article', { name: 'Send the email' });
    await userEvent.type(screen.getByLabelText('note'), 'ad');
    expect(api.approve).not.toHaveBeenCalled();
    expect(api.deny).not.toHaveBeenCalled();
  });

  it('shows the empty state', async () => {
    api.listApprovals.mockResolvedValue([]);
    renderWithProviders(<ApprovalsList />);
    expect(await screen.findByText('Nothing needs you')).toBeInTheDocument();
  });
});
