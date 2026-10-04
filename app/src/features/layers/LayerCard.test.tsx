import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { layer, task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { LayerCard } from './LayerCard';

const api = vi.hoisted(() => ({
  pauseLayer: vi.fn(),
  resumeLayer: vi.fn(),
  killLayer: vi.fn(),
  redirectLayer: vi.fn(),
}));
vi.mock('@/api/client', () => ({ api }));

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  useLiveStore.setState({ tasks: { t1: task() }, layers: {} });
});

describe('LayerCard', () => {
  it('shows the task, current step, status and the using-screen indicator', () => {
    renderWithProviders(<LayerCard layer={layer({ usesScreen: true })} />);
    expect(screen.getByText('Organize Downloads')).toBeInTheDocument();
    expect(screen.getByText('Now: List files')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Using your screen')).toBeInTheDocument();
  });

  it('hides the using-screen indicator when the layer does not use the screen', () => {
    renderWithProviders(<LayerCard layer={layer({ usesScreen: false })} />);
    expect(screen.queryByText('Using your screen')).not.toBeInTheDocument();
  });

  it('pauses, and offers Resume when paused', async () => {
    api.pauseLayer.mockResolvedValue(layer({ status: 'paused' }));
    renderWithProviders(<LayerCard layer={layer()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(api.pauseLayer).toHaveBeenCalledWith('l1');
    await waitFor(() => expect(useLiveStore.getState().layers['l1']?.status).toBe('paused'));
  });

  it('shows Resume for a paused layer', () => {
    renderWithProviders(<LayerCard layer={layer({ status: 'paused' })} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
  });

  it('asks for confirmation before killing', async () => {
    api.killLayer.mockResolvedValue(layer({ status: 'killed' }));
    renderWithProviders(<LayerCard layer={layer()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kill' }));
    expect(api.killLayer).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Kill this layer?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Kill layer' }));
    expect(api.killLayer).toHaveBeenCalledWith('l1');
  });

  it('cancelling the dialog does not kill', async () => {
    renderWithProviders(<LayerCard layer={layer()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kill' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.killLayer).not.toHaveBeenCalled();
  });

  it('redirects with the typed instruction', async () => {
    api.redirectLayer.mockResolvedValue(layer());
    renderWithProviders(<LayerCard layer={layer()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Redirect' }));
    await userEvent.type(screen.getByLabelText(/new instruction/i), 'Use the other folder');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(api.redirectLayer).toHaveBeenCalledWith('l1', 'Use the other folder');
  });

  it('disables controls once the layer has ended', () => {
    renderWithProviders(<LayerCard layer={layer({ status: 'done' })} />);
    expect(screen.getByRole('button', { name: 'Kill' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redirect' })).toBeDisabled();
  });
});
