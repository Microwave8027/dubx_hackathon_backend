import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { task } from '@/test/fixtures';
import { renderWithProviders } from '@/test/render';
import { useLiveStore } from '@/state/store';
import { AddTask } from './AddTask';

const createTask = vi.fn();
vi.mock('@/api/client', () => ({
  api: { createTask: (t: unknown) => createTask(t) },
}));

beforeEach(() => {
  createTask.mockReset();
  useLiveStore.setState({ tasks: {} });
  delete (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'];
});

describe('AddTask', () => {
  it('submits on Enter, clears the box and adds the task to the store', async () => {
    createTask.mockResolvedValue(task({ id: 'new', text: 'Do the thing' }));
    renderWithProviders(<AddTask />);
    await userEvent.type(screen.getByLabelText(/what should the agent do/i), 'Do the thing{Enter}');
    await waitFor(() => expect(createTask).toHaveBeenCalledWith({ text: 'Do the thing' }));
    await waitFor(() => expect(useLiveStore.getState().tasks['new']).toBeDefined());
    expect(screen.getByLabelText(/what should the agent do/i)).toHaveValue('');
  });

  it('does not submit blank text', async () => {
    renderWithProviders(<AddTask />);
    await userEvent.type(screen.getByLabelText(/what should the agent do/i), '   {Enter}');
    expect(createTask).not.toHaveBeenCalled();
  });

  it('keeps the text when the request fails', async () => {
    createTask.mockRejectedValue(new Error('down'));
    renderWithProviders(<AddTask />);
    await userEvent.type(screen.getByLabelText(/what should the agent do/i), 'Keep me{Enter}');
    await waitFor(() => expect(createTask).toHaveBeenCalled());
    expect(screen.getByLabelText(/what should the agent do/i)).toHaveValue('Keep me');
  });

  it('hides the mic when speech recognition is unsupported', () => {
    renderWithProviders(<AddTask />);
    expect(screen.queryByRole('button', { name: /dictate/i })).not.toBeInTheDocument();
  });

  it('shows the mic when speech recognition is available', () => {
    (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] = class {
      start() {}
      stop() {}
    };
    renderWithProviders(<AddTask />);
    expect(screen.getByRole('button', { name: /dictate/i })).toBeInTheDocument();
  });
});
