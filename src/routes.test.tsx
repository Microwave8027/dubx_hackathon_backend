import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routes } from './routes';

describe('router shell', () => {
  it('renders the dashboard with primary navigation', () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/'] })} />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
  });

  it('renders approvals route', () => {
    render(
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/approvals'] })} />,
    );
    expect(screen.getByRole('heading', { name: 'Approvals' })).toBeInTheDocument();
  });
});
