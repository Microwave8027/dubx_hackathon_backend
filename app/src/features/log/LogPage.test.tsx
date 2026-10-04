import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { LogEntry } from '@/api/types';
import { layer, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { useToastStore } from '@/state/toastStore';
import { LogPage } from './LogPage';

const api = vi.hoisted(() => ({ listLog: vi.fn(), listLayers: vi.fn(), undoLogEntry: vi.fn() }));
vi.mock('@/api/client', () => ({ api }));

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  id: 'e1',
  layerId: 'l1',
  ts: '2026-01-01T10:00:00.000Z',
  category: 'move_files',
  summary: 'Moved 4 PDFs',
  reversible: true,
  ...over,
});

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.listLayers.mockResolvedValue([layer()]);
  useToastStore.setState({ toasts: [] });
  useLiveStore.setState({ tasks: { t1: task() }, layers: { l1: layer() }, approvals: {} });
});

describe('LogPage', () => {
  it('lists entries and offers Undo only on reversible, not-yet-undone ones', async () => {
    api.listLog.mockResolvedValue([
      entry({ id: 'a', summary: 'Moved 4 PDFs' }),
      entry({ id: 'b', summary: 'Wrote summary.md', category: 'write_files', reversible: false }),
      entry({ id: 'c', summary: 'Moved images', undone: true }),
    ]);
    renderWithProviders(<LogPage />, '/log');
    await screen.findByText('Moved 4 PDFs');
    expect(screen.getByRole('button', { name: 'Undo: Moved 4 PDFs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo: Wrote summary/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo: Moved images/ })).not.toBeInTheDocument();
    expect(screen.getByText('Undone')).toBeInTheDocument();
  });

  it('undoes an entry and refreshes the list', async () => {
    api.listLog.mockResolvedValueOnce([entry()]).mockResolvedValue([entry({ undone: true })]);
    api.undoLogEntry.mockResolvedValue(entry({ undone: true }));
    renderWithProviders(<LogPage />, '/log');
    await userEvent.click(await screen.findByRole('button', { name: 'Undo: Moved 4 PDFs' }));
    expect(api.undoLogEntry).toHaveBeenCalledWith('e1');
    expect(await screen.findByText('Undone', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Undo:/ })).not.toBeInTheDocument();
  });

  it('shows a toast when undo fails', async () => {
    api.listLog.mockResolvedValue([entry()]);
    api.undoLogEntry.mockRejectedValue(new Error('409'));
    renderWithProviders(<LogPage />, '/log');
    await userEvent.click(await screen.findByRole('button', { name: 'Undo: Moved 4 PDFs' }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.kind).toBe('error'));
  });

  it('filters by layer and category through the API and the URL', async () => {
    api.listLog.mockResolvedValue([entry()]);
    renderWithProviders(<LogPage />, '/log?layer=l1&category=move_files');
    await screen.findByText('Moved 4 PDFs');
    expect(api.listLog).toHaveBeenCalledWith({ layerId: 'l1', category: 'move_files' });
    expect(screen.getByLabelText('Layer')).toHaveValue('l1');
    expect(screen.getByLabelText('Category')).toHaveValue('move_files');

    await userEvent.selectOptions(screen.getByLabelText('Category'), 'write_files');
    await waitFor(() =>
      expect(api.listLog).toHaveBeenLastCalledWith({ layerId: 'l1', category: 'write_files' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(api.listLog).toHaveBeenLastCalledWith({}));
  });

  it('ignores an unknown category in the URL', async () => {
    api.listLog.mockResolvedValue([]);
    renderWithProviders(<LogPage />, '/log?category=bogus');
    await screen.findByText('No activity yet');
    expect(api.listLog).toHaveBeenCalledWith({});
  });

  it('has distinct empty states for filtered and unfiltered, and an error state', async () => {
    api.listLog.mockResolvedValue([]);
    const first = renderWithProviders(<LogPage />, '/log?layer=l1');
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument();
    first.unmount();

    api.listLog.mockRejectedValue(new Error('down'));
    renderWithProviders(<LogPage />, '/log');
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
