import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AssistantError } from '@/assistant/api';
import type { Proposal } from '@/assistant/types';
import { setCalendarSourceForTests } from '@/calendar/source';
import type { CalendarDataset } from '@/calendar/types';
import { renderWithProviders } from '@/test/render';

const api = vi.hoisted(() => ({ assist: vi.fn(), applyOperations: vi.fn() }));
vi.mock('@/assistant/api', async (orig) => ({
  ...(await orig<typeof import('@/assistant/api')>()),
  assist: api.assist,
  applyOperations: api.applyOperations,
}));

import { AssistantPage } from './AssistantPage';

const proposal: Proposal = {
  summary: 'Moved gym to 6pm and cleared Friday.',
  warnings: ['Gym now overlaps with dinner'],
  operations: [
    {
      op: 'create',
      name: 'Deep work',
      start: '2026-10-05T09:00:00.000Z',
      stop: '2026-10-05T11:00:00.000Z',
      color: '#039BE5',
      reason: 'Quiet morning',
    },
    {
      op: 'update',
      id: 'e1',
      name: 'Gym',
      start: '2026-10-05T18:00:00.000Z',
      stop: '2026-10-05T19:00:00.000Z',
      color: '#0B8043',
    },
    { op: 'delete', id: 'e2' },
  ],
};

function useCalendarData() {
  const d = (h: number) => new Date(2026, 9, 5, h);
  const dataset: CalendarDataset = {
    skipped: 0,
    events: [
      {
        id: 'e1',
        title: 'Old gym',
        start: d(17),
        end: d(18),
        allDay: false,
        calendarName: 'x',
        tentative: false,
        cancelled: false,
      },
      {
        id: 'e2',
        title: 'Friday review',
        start: d(14),
        end: d(15),
        allDay: false,
        calendarName: 'x',
        tentative: false,
        cancelled: false,
      },
    ],
  };
  setCalendarSourceForTests({ load: () => Promise.resolve(dataset), subscribe: () => () => {} });
}

beforeEach(() => {
  api.assist.mockReset();
  api.applyOperations.mockReset();
  useCalendarData();
});
afterEach(() => setCalendarSourceForTests(null));

async function ask(text = 'Move gym to 6pm') {
  await userEvent.type(screen.getByLabelText('What should change?'), text);
  await userEvent.click(screen.getByRole('button', { name: 'Suggest changes' }));
}

describe('AssistantPage: asking', () => {
  it('cannot send an empty prompt, and examples fill the box', async () => {
    renderWithProviders(<AssistantPage />);
    expect(screen.getByRole('button', { name: 'Suggest changes' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Clear my Friday afternoon/ }));
    expect(screen.getByLabelText('What should change?')).toHaveValue('Clear my Friday afternoon');
    expect(screen.getByRole('button', { name: 'Suggest changes' })).toBeEnabled();
  });

  it('shows the summary, warnings and each change with a word label', async () => {
    api.assist.mockResolvedValue(proposal);
    renderWithProviders(<AssistantPage />);
    await ask();
    expect(api.assist).toHaveBeenCalledWith('Move gym to 6pm');
    expect(await screen.findByText(proposal.summary)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('overlaps with dinner');
    const list = screen.getByRole('list', { name: 'Proposed changes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(list).toHaveTextContent('Add');
    expect(list).toHaveTextContent('Change');
    expect(list).toHaveTextContent('Remove');
    expect(list).toHaveTextContent('Quiet morning'); // the explanation
    // The originals come from the calendar so you can see what changes.
    expect(list).toHaveTextContent('was Old gym');
    expect(list).toHaveTextContent('Friday review');
    expect(screen.getAllByRole('checkbox').every((c) => (c as HTMLInputElement).checked)).toBe(
      true,
    );
  });

  it('sends with Ctrl+Enter', async () => {
    api.assist.mockResolvedValue({ summary: '', warnings: [], operations: [] });
    renderWithProviders(<AssistantPage />);
    await userEvent.type(screen.getByLabelText('What should change?'), 'hello');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(api.assist).toHaveBeenCalledWith('hello'));
  });

  it('says so when nothing needs to change', async () => {
    api.assist.mockResolvedValue({ summary: 'Already fine.', warnings: [], operations: [] });
    renderWithProviders(<AssistantPage />);
    await ask();
    expect(await screen.findByText('No changes needed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Apply/ })).not.toBeInTheDocument();
  });

  it('shows a thinking state and blocks a second send meanwhile', async () => {
    let resolve!: (p: Proposal) => void;
    api.assist.mockReturnValue(new Promise<Proposal>((r) => (resolve = r)));
    renderWithProviders(<AssistantPage />);
    await ask();
    expect(screen.getByRole('status')).toHaveTextContent(/reading your calendar/i);
    expect(screen.getByRole('button', { name: 'Thinking…' })).toBeDisabled();
    resolve({ summary: '', warnings: [], operations: [] });
    expect(await screen.findByText('No changes needed.')).toBeInTheDocument();
  });
});

describe('AssistantPage: applying', () => {
  async function propose() {
    api.assist.mockResolvedValue(proposal);
    renderWithProviders(<AssistantPage />);
    await ask();
    await screen.findByText(proposal.summary);
  }

  it('applies only the changes left ticked', async () => {
    api.applyOperations.mockResolvedValue([
      { op: 'create', id: 'n1', ok: true },
      { op: 'delete', id: 'e2', ok: true },
    ]);
    await propose();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Apply change 2' })); // untick "Change"
    await userEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
    await waitFor(() => expect(api.applyOperations).toHaveBeenCalledTimes(1));
    const sent = api.applyOperations.mock.calls[0]?.[0] as { op: string }[];
    expect(sent.map((o) => o.op)).toEqual(['create', 'delete']);
    // Done: the proposal and the prompt are cleared.
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Proposed changes' })).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText('What should change?')).toHaveValue('');
  });

  it('cannot apply with nothing ticked', async () => {
    await propose();
    for (const n of [1, 2, 3])
      await userEvent.click(screen.getByRole('checkbox', { name: `Apply change ${n}` }));
    expect(screen.getByRole('button', { name: 'Apply 0 changes' })).toBeDisabled();
  });

  it('keeps the proposal when some changes fail, so you can see what happened', async () => {
    api.applyOperations.mockResolvedValue([
      { op: 'create', id: 'n1', ok: true },
      { op: 'update', id: 'e1', ok: false, error: 'Event not found' },
      { op: 'delete', id: 'e2', ok: true },
    ]);
    await propose();
    await userEvent.click(screen.getByRole('button', { name: 'Apply 3 changes' }));
    await waitFor(() => expect(api.applyOperations).toHaveBeenCalled());
    expect(screen.getByRole('list', { name: 'Proposed changes' })).toBeInTheDocument();
  });

  it('shows an error when applying fails outright', async () => {
    api.applyOperations.mockRejectedValue(
      new AssistantError('The server refused the request (400).', 400),
    );
    await propose();
    await userEvent.click(screen.getByRole('button', { name: 'Apply 3 changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('refused the request');
  });

  it('discards a proposal without touching the calendar', async () => {
    await propose();
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('list', { name: 'Proposed changes' })).not.toBeInTheDocument();
    expect(api.applyOperations).not.toHaveBeenCalled();
  });
});

describe('AssistantPage: errors', () => {
  it('asks you to sign in on a 401, with a link to Google login, and retries after', async () => {
    api.assist.mockRejectedValueOnce(new AssistantError('Not signed in', 401));
    renderWithProviders(<AssistantPage />);
    await ask();
    const link = await screen.findByRole('link', { name: 'Sign in with Google' });
    expect(link.getAttribute('href')).toMatch(/\/auth\/google$/);
    api.assist.mockResolvedValueOnce(proposal);
    await userEvent.click(screen.getByRole('button', { name: /i’ve signed in/i }));
    expect(await screen.findByText(proposal.summary)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in with Google' })).not.toBeInTheDocument();
  });

  it('shows the AI service error text', async () => {
    api.assist.mockRejectedValue(new AssistantError('Gemini returned an invalid response', 502));
    renderWithProviders(<AssistantPage />);
    await ask();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gemini returned an invalid response',
    );
  });

  it('shows a generic message for an unexpected failure', async () => {
    api.assist.mockRejectedValue('boom');
    renderWithProviders(<AssistantPage />);
    await ask();
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
  });
});
