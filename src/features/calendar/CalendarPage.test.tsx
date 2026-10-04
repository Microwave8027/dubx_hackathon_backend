import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { CalendarDataset, ScheduleEvent } from '@/calendar/types';
import { setCalendarSourceForTests } from '@/calendar/source';
import { createFakePlatform } from '@/test/fakePlatform';
import { renderWithProviders } from '@/test/render';
import { setPlatformForTests } from '@/platform';

const google = vi.hoisted(() => ({
  getGoogleStatus: vi.fn(),
  startGoogleConnect: vi.fn(),
  disconnectGoogle: vi.fn(),
}));
vi.mock('@/calendar/google', async (orig) => ({
  ...(await orig<typeof import('@/calendar/google')>()),
  ...google,
}));

import { CalendarPage } from './CalendarPage';

const MIN = 60_000;
function event(
  id: string,
  title: string,
  startMin: number,
  durMin: number,
  extra: Partial<ScheduleEvent> = {},
): ScheduleEvent {
  const start = new Date(Date.now() + startMin * MIN);
  return {
    id,
    title,
    start,
    end: new Date(start.getTime() + durMin * MIN),
    allDay: false,
    calendarName: 'School',
    tentative: false,
    cancelled: false,
    ...extra,
  };
}

function useDataset(events: ScheduleEvent[], skipped = 0) {
  const dataset: CalendarDataset = { events, skipped };
  setCalendarSourceForTests({ load: () => Promise.resolve(dataset), subscribe: () => () => {} });
}

beforeEach(() => {
  Object.values(google).forEach((m) => m.mockReset());
  google.getGoogleStatus.mockResolvedValue({ connected: true, account: 'me@example.com' });
  useDataset([]);
  setPlatformForTests(createFakePlatform());
});
afterEach(() => {
  setCalendarSourceForTests(null);
  setPlatformForTests(null);
});

describe('CalendarPage: linking', () => {
  it('offers to connect Google Calendar when not linked', async () => {
    google.getGoogleStatus.mockResolvedValue({ connected: false });
    renderWithProviders(<CalendarPage />);
    expect(
      await screen.findByRole('button', { name: 'Connect Google Calendar' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Calendar view' })).not.toBeInTheDocument();
  });

  it('opens the Google consent page in the system browser and waits for the link', async () => {
    google.getGoogleStatus.mockResolvedValue({ connected: false });
    google.startGoogleConnect.mockResolvedValue({
      authUrl: 'https://accounts.google.com/o/oauth2/auth?x=1',
    });
    const platform = createFakePlatform();
    setPlatformForTests(platform);
    renderWithProviders(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }));
    await waitFor(() =>
      expect(platform.openExternal).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/auth?x=1',
      ),
    );
    expect(await screen.findByText(/waiting for you to finish signing in/i)).toBeInTheDocument();

    // The backend reports connected: the calendar takes over.
    google.getGoogleStatus.mockResolvedValue({ connected: true, account: 'me@example.com' });
    await userEvent.click(screen.getByRole('button', { name: /i’ve finished/i }));
    expect(await screen.findByRole('radiogroup', { name: 'Calendar view' })).toBeInTheDocument();
    expect(screen.getByText(/me@example.com/)).toBeInTheDocument();
  });

  it('refuses a consent URL that is not https', async () => {
    google.getGoogleStatus.mockResolvedValue({ connected: false });
    google.startGoogleConnect.mockResolvedValue({ authUrl: 'http://evil.example/steal' });
    const platform = createFakePlatform();
    setPlatformForTests(platform);
    renderWithProviders(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be started/i);
    expect(platform.openExternal).not.toHaveBeenCalled();
  });

  it('links at once when the backend says it is already connected', async () => {
    google.getGoogleStatus.mockResolvedValueOnce({ connected: false });
    google.startGoogleConnect.mockResolvedValue({ connected: true, account: 'me@example.com' });
    google.getGoogleStatus.mockResolvedValue({ connected: true, account: 'me@example.com' });
    renderWithProviders(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Connect Google Calendar' }));
    expect(await screen.findByRole('radiogroup', { name: 'Calendar view' })).toBeInTheDocument();
  });

  it('still shows the calendar when the status endpoint does not exist yet', async () => {
    google.getGoogleStatus.mockRejectedValue(new Error('404'));
    useDataset([event('a', 'Standup', 30, 15)]);
    renderWithProviders(<CalendarPage />);
    expect(await screen.findByRole('article', { name: 'Standup' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
  });

  it('disconnects after confirmation', async () => {
    google.disconnectGoogle.mockResolvedValue({});
    renderWithProviders(<CalendarPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog', {
      name: /disconnect google calendar/i,
      hidden: true,
    });
    expect(google.disconnectGoogle).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Disconnect', hidden: true }));
    await waitFor(() => expect(google.disconnectGoogle).toHaveBeenCalled());
  });
});

describe('CalendarPage: events', () => {
  it('shows today’s events in the week with their state in words', async () => {
    useDataset([
      event('now', 'Lecture', -10, 60),
      event('soon', 'Study group', 5, 30),
      event('later', 'Gym', 240, 60),
    ]);
    renderWithProviders(<CalendarPage />);
    const lecture = await screen.findByRole('article', { name: 'Lecture' });
    expect(lecture).toHaveTextContent('In progress');
    expect(screen.getByRole('article', { name: 'Study group' })).toHaveTextContent('Starting soon');
    expect(screen.getByRole('article', { name: 'Gym' })).toBeInTheDocument();
    const today = document.querySelector('[data-today="true"]');
    expect(today).not.toBeNull();
  });

  it('marks ended events and shows details on demand', async () => {
    useDataset([
      event('old', 'Review', -180, 30, { location: 'Room 4', description: 'Bring notes' }),
    ]);
    renderWithProviders(<CalendarPage />);
    const item = await screen.findByRole('article', { name: 'Review' });
    expect(item).toHaveTextContent('Ended');
    expect(item).toHaveTextContent('Details');
    expect(item).toHaveTextContent('Room 4');
  });

  it('goes to the next and previous week and back to today', async () => {
    renderWithProviders(<CalendarPage />);
    await screen.findByRole('radiogroup', { name: 'Calendar view' });
    const label = () => screen.getByText(/–.*\d{4}$/).textContent;
    const start = label();
    await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(label()).not.toBe(start);
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(label()).toBe(start);
    await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(label()).not.toBe(start);
  });

  it('switches to the agenda, which lists only days that have events', async () => {
    useDataset([event('a', 'Standup', 30, 15), event('b', 'Dentist', 3 * 24 * 60, 30)]);
    renderWithProviders(<CalendarPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'agenda' }));
    const agenda = screen.getByRole('list', { name: 'Agenda' });
    expect(within(agenda).getAllByRole('article')).toHaveLength(2);
  });

  it('says so when the agenda is clear', async () => {
    renderWithProviders(<CalendarPage />);
    await userEvent.click(await screen.findByRole('radio', { name: 'agenda' }));
    // With no events at all the shared empty state is shown.
    expect(await screen.findByText('Nothing on your calendar')).toBeInTheDocument();
  });

  it('mentions events that could not be read', async () => {
    useDataset([event('a', 'Standup', 30, 15)], 2);
    renderWithProviders(<CalendarPage />);
    expect(await screen.findByRole('note')).toHaveTextContent('2 events could not be read');
  });

  it('leaves cancelled events out', async () => {
    useDataset([
      event('x', 'Cancelled thing', 30, 15, { cancelled: true }),
      event('a', 'Standup', 30, 15),
    ]);
    renderWithProviders(<CalendarPage />);
    await screen.findByRole('article', { name: 'Standup' });
    expect(screen.queryByRole('article', { name: 'Cancelled thing' })).not.toBeInTheDocument();
  });
});
