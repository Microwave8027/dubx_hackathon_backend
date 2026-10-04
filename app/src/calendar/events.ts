import type { QueryClient } from '@tanstack/react-query';
import type { ServerEvent } from '@/api/types';
import { getCalendarSource } from './source';
import type { CalendarSource } from './types';
import { CALENDAR_KEY } from './useCalendar';

/**
 * calendar.snapshot with a payload: normalize and push into the cache (no refetch).
 * calendar.snapshot without one, or calendar.updated: refetch.
 */
export function handleCalendarEvent(
  event: ServerEvent,
  queryClient: QueryClient,
  source: CalendarSource = getCalendarSource(),
): void {
  if (event.type === 'calendar.snapshot' && event.data !== undefined && event.data !== null) {
    source.ingest?.(event.data);
    return;
  }
  if (event.type === 'calendar.snapshot' || event.type === 'calendar.updated') {
    void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
  }
}
