import type { ScheduleEvent } from './types';

export type EventState =
  'ended' | 'active' | 'in progress' | 'starting soon' | 'deferred' | 'upcoming';

export interface StateContext {
  /** activeContext.blockId from the agent, if any. */
  activeBlockId?: string | null;
  /** Ids from the existing deferred-blocks list. */
  deferredIds?: ReadonlySet<string> | readonly string[];
}

const SOON_MS = 15 * 60_000;

/** Derived on the client; the daemon does not send a state. Order matters. */
export function deriveEventState(
  event: Pick<ScheduleEvent, 'id' | 'start' | 'end'>,
  now: Date,
  ctx: StateContext = {},
): EventState {
  const t = now.getTime();
  const start = event.start.getTime();
  const end = event.end.getTime();
  if (end < t) return 'ended';
  if (ctx.activeBlockId != null && ctx.activeBlockId === event.id) return 'active';
  if (t >= start && t <= end) return 'in progress';
  if (start - t > 0 && start - t <= SOON_MS) return 'starting soon';
  const deferred = ctx.deferredIds;
  if (deferred) {
    const isDeferred = Array.isArray(deferred)
      ? deferred.includes(event.id)
      : (deferred as ReadonlySet<string>).has(event.id);
    if (isDeferred) return 'deferred';
  }
  return 'upcoming';
}

/** Every state has a text label so it never relies on color alone. */
export const stateLabel: Record<EventState, string> = {
  ended: 'Ended',
  active: 'Active',
  'in progress': 'In progress',
  'starting soon': 'Starting soon',
  deferred: 'Deferred',
  upcoming: 'Upcoming',
};
