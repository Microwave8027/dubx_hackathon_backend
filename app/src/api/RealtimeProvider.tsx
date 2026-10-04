import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLiveStore } from '@/state/store';
import { api } from './client';
import { getTransport } from '@/transport';
import { queryKeys } from './queries';
import { CALENDAR_KEY } from '@/calendar/useCalendar';
import { handleCalendarEvent } from '@/calendar/events';
import { notifyForEvent } from '@/notifications/notifyEvents';
import { createWsClient } from './ws';

/** Keeps the Zustand store live: REST hydrates it, WS events update it, reconnect refetches all. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const store = useLiveStore.getState();

    async function refetchAll() {
      const [tasks, layers, approvals] = await Promise.all([
        queryClient.fetchQuery({ queryKey: queryKeys.tasks, queryFn: api.listTasks, staleTime: 0 }),
        queryClient.fetchQuery({
          queryKey: queryKeys.layers,
          queryFn: api.listLayers,
          staleTime: 0,
        }),
        queryClient.fetchQuery({
          queryKey: queryKeys.approvals,
          queryFn: api.listApprovals,
          staleTime: 0,
        }),
      ]);
      store.hydrate({ tasks, layers, approvals });
      void queryClient.invalidateQueries({ queryKey: ['log'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.briefing });
      void queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
    }

    const client = createWsClient({
      transport: getTransport,
      onEvent: (event) => {
        const previousTask =
          event.type === 'task.updated' ? useLiveStore.getState().tasks[event.data.id] : undefined;
        void notifyForEvent(event, previousTask);
        store.applyEvent(event);
        if (event.type === 'briefing.ready') {
          void queryClient.invalidateQueries({ queryKey: queryKeys.briefing });
        }
        handleCalendarEvent(event, queryClient);
        if (event.type === 'approval.resolved' || event.type === 'layer.updated') {
          void queryClient.invalidateQueries({ queryKey: ['log'] });
        }
      },
      onState: store.setConnection,
      onConnected: () => {
        refetchAll().catch(() => {
          /* surfaced through query error states */
        });
      },
    });
    client.start();
    return () => client.stop();
  }, [queryClient]);

  return <>{children}</>;
}
