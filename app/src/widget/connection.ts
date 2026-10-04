import { api } from '@/api/client';
import { createWsClient } from '@/api/ws';
import type { ServerEvent } from '@/api/types';
import { useLiveStore } from '@/state/store';
import { getTransport } from '@/transport';

/** Everything the widget shows is derived from these. Notably not layer.frame: no previews here. */
export const WIDGET_EVENT_TYPES = [
  'task.updated',
  'layer.updated',
  'approval.requested',
  'approval.resolved',
] as const satisfies readonly ServerEvent['type'][];

/**
 * The widget is its own webview, so it keeps its own light connection: a REST snapshot of tasks,
 * layers and approvals, then WS events. It reuses the same API client, WS client and store as the
 * main window, and skips queries, notifications and frames.
 */
export function startWidgetConnection(): () => void {
  const store = useLiveStore.getState();
  const client = createWsClient({
    transport: getTransport,
    acceptTypes: WIDGET_EVENT_TYPES,
    onEvent: (event) => store.applyEvent(event),
    onState: store.setConnection,
    onConnected: () => {
      Promise.all([api.listTasks(), api.listLayers(), api.listApprovals()])
        .then(([tasks, layers, approvals]) => store.hydrate({ tasks, layers, approvals }))
        .catch(() => {
          /* the next reconnect or event refreshes it; the widget just shows what it has */
        });
    },
  });
  client.start();
  return () => client.stop();
}
