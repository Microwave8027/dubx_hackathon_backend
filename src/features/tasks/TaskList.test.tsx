import { screen } from '@testing-library/react';
import { vi } from 'vitest';
import { task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { TaskList } from './TaskList';

const listTasks = vi.fn();
vi.mock('@/api/client', () => ({
  api: { listTasks: () => listTasks(), patchTask: vi.fn() },
}));

beforeEach(() => {
  listTasks.mockReset();
  useLiveStore.setState({ tasks: {} });
});

describe('TaskList', () => {
  it('shows a loading state, then the empty state', async () => {
    listTasks.mockResolvedValue([]);
    renderWithProviders(<TaskList />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
  });

  it('shows tasks with status text, needing-you first', async () => {
    listTasks.mockResolvedValue([
      task({ id: 'a', text: 'Running one', status: 'running' }),
      task({ id: 'b', text: 'Blocked one', status: 'waiting_approval' }),
    ]);
    renderWithProviders(<TaskList />);
    const items = await screen.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Blocked one');
    expect(items[0]).toHaveTextContent('Waiting approval');
    expect(items[1]).toHaveTextContent('Running one');
  });

  it('shows an error state with retry when the request fails', async () => {
    listTasks.mockRejectedValue(new Error('nope'));
    renderWithProviders(<TaskList />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the agent/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('TaskList offline', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says you are offline instead of showing skeletons', () => {
    listTasks.mockReturnValue(new Promise(() => {}));
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithProviders(<TaskList />);
    expect(screen.getByRole('alert')).toHaveTextContent('You are offline.');
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument();
  });
});

describe('TaskList offline after loading', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps showing the empty state when the panel already loaded and then goes offline', async () => {
    listTasks.mockResolvedValue([]);
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    renderWithProviders(<TaskList />);
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText('No tasks yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
