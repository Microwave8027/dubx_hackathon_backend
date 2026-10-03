import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { approval } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { PendingBadge } from '@/components/PendingBadge';
import { Dashboard } from './Dashboard';

vi.mock('@/api/client', () => ({
  api: {
    listTasks: vi.fn().mockResolvedValue([]),
    listLayers: vi.fn().mockResolvedValue([]),
    listApprovals: vi.fn().mockResolvedValue([]),
  },
}));

function setViewport(mid: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: mid,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe('Dashboard', () => {
  it('on a phone mounts only the active panel', () => {
    setViewport(false);
    renderWithProviders(<Dashboard />, '/?tab=layers');
    expect(screen.getByRole('heading', { name: 'Layers' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tasks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Approvals' })).not.toBeInTheDocument();
  });

  it('defaults to the tasks tab on a phone', () => {
    setViewport(false);
    renderWithProviders(<Dashboard />);
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Layers' })).not.toBeInTheDocument();
  });

  it('on wide screens shows all three panels', () => {
    setViewport(true);
    renderWithProviders(<Dashboard />);
    for (const name of ['Tasks', 'Layers', 'Approvals']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });
});

describe('PendingBadge', () => {
  it('is hidden at zero and shows the count with an accessible label', () => {
    useLiveStore.setState({ approvals: {} });
    const { rerender } = renderWithProviders(<PendingBadge />);
    expect(screen.queryByLabelText(/pending/)).not.toBeInTheDocument();
    useLiveStore.setState({ approvals: { a1: approval(), a2: approval({ id: 'a2' }) } });
    rerender(<PendingBadge />);
    expect(screen.getByLabelText('2 pending approvals')).toHaveTextContent('2');
  });
});
