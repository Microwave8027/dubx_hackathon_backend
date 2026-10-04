import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('offers a skip link to the main content', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
  });

  it('moves focus to the main content after navigating, but not on first load', async () => {
    renderAt('/');
    const main = document.querySelector('main#main');
    expect(main).not.toHaveFocus();
    await userEvent.click(screen.getAllByRole('link', { name: 'Settings' })[0]!);
    expect(main).toHaveFocus();
  });

  it('shows a not-found page with a way back', () => {
    renderAt('/nope/nothing');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
