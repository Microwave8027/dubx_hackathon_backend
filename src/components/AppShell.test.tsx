import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { routes } from '@/routes';

vi.mock('@/api/client', () => ({
  api: {
    listTasks: vi.fn().mockResolvedValue([]),
    listLayers: vi.fn().mockResolvedValue([]),
    listApprovals: vi.fn().mockResolvedValue([]),
  },
}));

function renderApp(path = '/') {
  localStorage.setItem('cc.onboarded', '1');
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const menu = () => screen.getByRole('complementary', { name: 'Menu', hidden: true });

describe('menu drawer', () => {
  it('opens from the menu button and closes with the close button', async () => {
    renderApp();
    const open = screen.getByRole('button', { name: 'Open menu' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).toHaveClass('invisible'); // closed: out of the tab order

    await userEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(menu()).toHaveClass('visible');
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(menu()).toHaveClass('invisible');
    expect(open).toHaveFocus(); // focus returns to where it came from
  });

  it('closes on Escape and on the scrim', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await userEvent.keyboard('{Escape}');
    expect(menu()).toHaveClass('invisible');

    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    await userEvent.click(screen.getByTestId('menu-scrim'));
    expect(menu()).toHaveClass('invisible');
  });

  it('lists the five destinations, navigates, and closes', async () => {
    const router = renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    for (const name of ['Dashboard', 'Approvals', 'Briefing', 'Activity', 'Settings']) {
      expect(nav).toHaveTextContent(name);
    }
    await userEvent.click(screen.getByRole('link', { name: 'Activity' }));
    expect(router.state.location.pathname).toBe('/log');
    expect(menu()).toHaveClass('invisible');
  });

  it('keeps the theme toggle in the menu', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const toggle = screen.getByRole('button', { name: /switch to (dark|light) theme/i });
    const before = toggle.textContent;
    await userEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: /switch to (dark|light) theme/i }).textContent,
    ).not.toBe(before);
  });
});
