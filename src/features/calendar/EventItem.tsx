import type { ScheduleEvent } from '@/calendar/types';
import { formatEventTime } from '@/calendar/range';
import { deriveEventState, stateLabel, type EventState } from '@/calendar/state';

const stateTone: Partial<Record<EventState, string>> = {
  'in progress': 'bg-status-working/15 text-status-working',
  active: 'bg-status-working/15 text-status-working',
  'starting soon': 'bg-status-needs/15 text-status-needs',
};

/** One event. State is always spelled out in words, never colour alone. */
export function EventItem({ event, day, now }: { event: ScheduleEvent; day: Date; now: Date }) {
  const state = deriveEventState(event, now);
  const ended = state === 'ended';
  const extra = event.location || event.description;
  return (
    <article
      aria-label={event.title}
      data-state={state}
      className={`rounded-lg border border-line bg-surface p-2.5 text-sm ${ended ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
          style={event.color ? { background: event.color } : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-5">{event.title}</p>
          <p className="text-xs text-muted">{formatEventTime(event, day)}</p>
          <p className="text-xs text-muted">
            {event.calendarName}
            {event.tentative ? ' · Tentative' : ''}
          </p>
        </div>
      </div>
      {(stateTone[state] || ended) && (
        <span
          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            stateTone[state] ?? 'bg-raised text-muted'
          }`}
        >
          {stateLabel[state]}
        </span>
      )}
      {extra && (
        <details className="mt-2 text-xs text-muted">
          <summary className="min-h-[24px] cursor-pointer select-none">Details</summary>
          {event.location && <p className="mt-1">📍 {event.location}</p>}
          {event.description && <p className="mt-1 whitespace-pre-line">{event.description}</p>}
        </details>
      )}
    </article>
  );
}
