import type { ServerEvent, Task } from '@/api/types';
import { getPlatform, type Platform } from '@/platform';

export interface NotifyDeps {
  platform: Pick<Platform, 'notify'>;
  isFocused(): boolean;
}

const defaultDeps = (): NotifyDeps => ({
  platform: getPlatform(),
  isFocused: () => document.hasFocus() && !document.hidden,
});

/**
 * Native notification for approval.requested, briefing.ready and task completion,
 * only while the window is unfocused. Call BEFORE applying the event to the store,
 * passing the task as it was, so completion is detected as a transition.
 */
export async function notifyForEvent(
  event: ServerEvent,
  previousTask: Task | undefined,
  deps: NotifyDeps = defaultDeps(),
): Promise<void> {
  if (deps.isFocused()) return;
  try {
    switch (event.type) {
      case 'approval.requested':
        if (event.data.status !== 'pending') return;
        await deps.platform.notify({
          title: 'Needs your decision',
          body: event.data.action.summary,
          deepLink: '/approvals',
        });
        return;
      case 'briefing.ready':
        await deps.platform.notify({
          title: 'Your briefing is ready',
          body: event.data.summary,
          deepLink: '/briefing',
        });
        return;
      case 'task.updated':
        if (event.data.status === 'done' && previousTask?.status !== 'done') {
          await deps.platform.notify({
            title: 'Task finished',
            body: event.data.text,
            deepLink: event.data.layerId ? `/layers/${event.data.layerId}` : '/',
          });
        }
        return;
      default:
        return;
    }
  } catch {
    // A failed notification must never break the event stream.
  }
}
