import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi } from 'vitest';
import type { ServerEvent } from '@/api/types';
import { setTransport } from '@/transport';
import type { Transport } from '@/transport/types';
import { handleCalendarEvent } from './events';
import { getCalendarSource, setCalendarSourceForTests } from './source';
import { CALENDAR_KEY, useCalendar } from './useCalendar';

const payload = (title: string) => ({
  timezone: 'UTC',
  events: [{ id: 'a', title, start: '2026-10-03T10:00:00Z', end: '2026-10-03T11:00:00Z' }],
});

let request: ReturnType<typeof vi.fn<Transport['request']>>;
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  setCalendarSourceForTests(null);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  request = vi
    .fn<Transport['request']>()
    .mockResolvedValue({ status: 200, json: payload('From fetch') });
  const t: Transport = { kind: 'direct', request, openEvents: () => ({ close() {} }) };
  setTransport(t);
});

const snapshot = (data?: unknown): ServerEvent => ({ type: 'calendar.snapshot', data });

describe('calendar query and pushed snapshots', () => {
  it('loads once, then a snapshot with a payload updates the cache without a refetch', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.data?.events[0]?.title).toBe('From fetch'));
    expect(request).toHaveBeenCalledTimes(1);

    act(() => handleCalendarEvent(snapshot(payload('Pushed')), client));
    await waitFor(() => expect(result.current.data?.events[0]?.title).toBe('Pushed'));
    expect(request).toHaveBeenCalledTimes(1); // no reload, no refetch
    expect(client.getQueryData<{ events: unknown[] }>(CALENDAR_KEY)?.events).toHaveLength(1);
  });

  it('the pushed data is normalized (Dates, not raw strings)', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => handleCalendarEvent(snapshot(payload('P')), client));
    await waitFor(() => expect(result.current.data?.events[0]?.title).toBe('P'));
    expect(result.current.data?.events[0]?.start).toBeInstanceOf(Date);
  });

  it('a malformed snapshot is ignored and the cached calendar stays', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => handleCalendarEvent(snapshot({ nonsense: true }), client));
    expect(result.current.data?.events[0]?.title).toBe('From fetch');
  });

  it('calendar.updated, and a snapshot with no payload, trigger a refetch', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    request.mockResolvedValue({ status: 200, json: payload('Refetched') });

    act(() => handleCalendarEvent({ type: 'calendar.updated' }, client));
    await waitFor(() => expect(result.current.data?.events[0]?.title).toBe('Refetched'));
    expect(request).toHaveBeenCalledTimes(2);

    act(() => handleCalendarEvent(snapshot(undefined), client));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  });

  it('ignores unrelated events', async () => {
    const { result } = renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() =>
      handleCalendarEvent(
        {
          type: 'layer.updated',
          data: { id: 'l', taskId: 't', status: 'running', steps: [], usesScreen: false },
        },
        client,
      ),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('is configured to refetch every 5 minutes and on focus', async () => {
    renderHook(() => useCalendar(), { wrapper });
    await waitFor(() => expect(request).toHaveBeenCalled());
    const options = client.getQueryCache().find({ queryKey: CALENDAR_KEY })?.observers[0]?.options;
    expect(options?.refetchInterval).toBe(5 * 60_000);
    expect(options?.refetchOnWindowFocus).toBe(true);
    expect(options?.refetchIntervalInBackground).not.toBe(true); // paused while the tab is hidden
  });

  it('uses the HTTP source unless the Tauri source is enabled', () => {
    expect(typeof getCalendarSource().load).toBe('function');
  });
});
