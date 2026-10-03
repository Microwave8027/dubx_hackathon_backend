import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCalendarSource } from './source';
import type { CalendarDataset } from './types';

export const CALENDAR_KEY = ['calendar'] as const;
export const CALENDAR_REFRESH_MS = 5 * 60_000;

/**
 * The calendar as a normalized dataset. Pushed snapshots are written straight into the query
 * cache; the query also refetches every 5 minutes while the tab is visible, and on focus.
 */
export function useCalendar() {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      getCalendarSource().subscribe((d: CalendarDataset) => {
        queryClient.setQueryData(CALENDAR_KEY, d);
      }),
    [queryClient],
  );

  return useQuery({
    queryKey: CALENDAR_KEY,
    queryFn: () => getCalendarSource().load(),
    // Intervals pause in background tabs (refetchIntervalInBackground defaults to false).
    refetchInterval: CALENDAR_REFRESH_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
