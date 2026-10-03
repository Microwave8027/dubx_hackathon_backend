import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { approval } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { Dashboard } from './Dashboard';

vi.mock('@/api/client', () => ({
  api: {
    listTasks: vi.fn().mockResolvedValue([]),
    listLayers: vi.fn().mockResolvedValue([]),
    listApprovals: vi.fn().mockResolvedValue([]),
  },
}));

describe('Dashboard', () => {
  it('shows Tasks, Layers and Approvals together', () => {
    renderWithProviders(<Dashboard />);
    for (const name of ['Tasks', 'Layers', 'Approvals']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('shows how many items each column holds', () => {
    useLiveStore.setState({
      tasks: {},
      layers: {},
      approvals: {
        a1: approval(),
        a2: approval({ id: 'a2' }),
        a3: approval({ id: 'a3', status: 'approved' }),
      },
    });
    renderWithProviders(<Dashboard />);
    const approvals = screen.getByRole('heading', { name: 'Approvals' }).parentElement!;
    expect(approvals).toHaveTextContent('2'); // only pending ones count
    useLiveStore.setState({ approvals: {} });
  });
});
