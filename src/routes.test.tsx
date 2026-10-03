import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { routes } from './routes';

vi.mock('@/api/client', () => ({
  api: {
    listTasks: vi.fn().mockResolvedValue([]),
    listLayers: vi.fn().mockResolvedValue([]),
    listApprovals: vi.fn().mockResolvedValue([]),
  },
}));

function renderAt(path: string) {
  localStorage.setItem('cc.onboarded', '1');
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </QueryClientProvider>,
  );
}

describe('router shell', () => {
  it('renders the dashboard with primary navigation', async () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThan(0);
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
  });

  it('renders approvals route', () => {
    renderAt('/approvals');
    expect(screen.getByRole('heading', { name: 'Approvals' })).toBeInTheDocument();
  });
});
