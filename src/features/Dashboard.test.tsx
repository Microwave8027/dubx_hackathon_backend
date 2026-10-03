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

describe('Dashboard', () => {
  it('renders the three panels in the DOM and marks inactive ones hidden on phones', () => {
    renderWithProviders(<Dashboard />, '/?tab=layers');
    const layers = screen.getByRole('heading', { name: 'Layers' }).closest('section');
    const tasks = screen.getByRole('heading', { name: 'Tasks' }).closest('section');
    expect(layers).toHaveClass('block');
    expect(tasks).toHaveClass('hidden', 'mid:block');
  });

  it('defaults to the tasks tab', () => {
    renderWithProviders(<Dashboard />);
    expect(screen.getByRole('heading', { name: 'Tasks' }).closest('section')).toHaveClass('block');
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
