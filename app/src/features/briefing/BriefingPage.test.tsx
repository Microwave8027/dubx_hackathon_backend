import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ApiError } from '@/transport/errors';
import { approval, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { BriefingPage } from './BriefingPage';

const api = vi.hoisted(() => ({
  latestBriefing: vi.fn(),
  listApprovals: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
}));
vi.mock('@/api/client', async () => {
  const { ApiError } = await import('@/transport/errors');
  return { api, ApiError };
});

const briefing = {
  id: 'b1',
  kind: 'morning' as const,
  generatedAt: '2026-01-01T08:00:00.000Z',
  summary: '2 tasks finished, 1 waiting on you.',
  finished: [{ taskId: 't1', text: 'Research a topic', summary: 'Wrote summary.md' }],
  approvalIds: ['a1', 'a2'],
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  const a1 = approval({
    id: 'a1',
    action: { category: 'send_message', summary: 'Send the email' },
  });
  const a2 = approval({
    id: 'a2',
    status: 'approved',
    action: { category: 'install_software', summary: 'Install a font' },
  });
  api.listApprovals.mockResolvedValue([a1, a2]);
  useLiveStore.setState({ tasks: { t1: task({ layerId: 'l1' }) }, layers: {}, approvals: {} });
});

describe('BriefingPage', () => {
  it('shows the summary, what finished, and decisions with inline approve/deny', async () => {
    api.latestBriefing.mockResolvedValue(briefing);
    renderWithProviders(<BriefingPage />, '/briefing');
    expect(await screen.findByRole('heading', { name: 'Morning briefing' })).toBeInTheDocument();
    expect(screen.getByText('2 tasks finished, 1 waiting on you.')).toBeInTheDocument();
    expect(screen.getByText('Wrote summary.md')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument();
    // Already-resolved decisions are shown, not actionable.
    expect(screen.getByText(/Install a font/)).toHaveTextContent('(approved)');
    // The briefing keeps the context compact: no screenshots inline.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('approves inline', async () => {
    api.latestBriefing.mockResolvedValue(briefing);
    api.approve.mockResolvedValue(approval({ id: 'a1', status: 'approved' }));
    renderWithProviders(<BriefingPage />, '/briefing');
    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(api.approve).toHaveBeenCalledWith('a1');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument(),
    );
  });

  it('treats a 404 as "no briefing yet", not an error', async () => {
    api.latestBriefing.mockRejectedValue(new ApiError('not found', 404));
    renderWithProviders(<BriefingPage />, '/briefing');
    expect(await screen.findByText('No briefing yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error with retry for other failures', async () => {
    api.latestBriefing.mockRejectedValue(new ApiError('boom', 500));
    renderWithProviders(<BriefingPage />, '/briefing');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('says so when nothing needs a decision', async () => {
    api.latestBriefing.mockResolvedValue({ ...briefing, approvalIds: [], finished: [] });
    renderWithProviders(<BriefingPage />, '/briefing');
    expect(await screen.findByText('Nothing needs a decision right now.')).toBeInTheDocument();
    expect(screen.getByText('Nothing has finished yet.')).toBeInTheDocument();
  });
});
