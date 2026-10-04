import { useEffect, useMemo, useState } from 'react';
import { addDays, groupByDay, isSameDay, startOfDay, startOfWeek } from '@/calendar/range';
import { useCalendar } from '@/calendar/useCalendar';
import { useGoogleLink } from '@/calendar/useGoogleLink';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PanelState } from '@/components/PanelState';
import { ConnectCard } from './ConnectCard';
import { EventItem } from './EventItem';

type View = 'week' | 'agenda';
const AGENDA_DAYS = 14;

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' });
const longDayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});
const rangeFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' });

/** Re-render every minute so "starting soon" and "ended" stay current. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const btn = 'min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line';

export function CalendarPage() {
  const link = useGoogleLink();
  const now = useNow();
  const [view, setView] = useState<View>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [confirming, setConfirming] = useState(false);
  const showCalendar = link.state === 'connected' || link.state === 'unknown';
  const query = useCalendar();
  const events = useMemo(() => query.data?.events ?? [], [query.data]);

  const days = useMemo(
    () =>
      view === 'week'
        ? groupByDay(events, weekStart, 7)
        : groupByDay(events, startOfDay(now), AGENDA_DAYS).filter((g) => g.events.length > 0),
    [events, view, weekStart, now],
  );
  const weekEnd = addDays(weekStart, 6);
  const rangeLabel = `${rangeFmt.format(weekStart)} – ${rangeFmt.format(weekEnd)}, ${yearFmt.format(weekEnd)}`;
  const isEmpty = days.every((g) => g.events.length === 0);

  return (
    <section aria-labelledby="calendar-title" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="calendar-title" className="text-xl font-semibold">
          Calendar
        </h1>
        {link.state === 'connected' && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">
              Google Calendar{link.account ? ` · ${link.account}` : ' connected'}
            </span>
            <button type="button" onClick={() => setConfirming(true)} className={btn}>
              Disconnect
            </button>
          </div>
        )}
      </div>

      {link.state === 'loading' && (
        <div
          role="status"
          aria-label="Loading"
          className="h-24 animate-pulse-soft rounded-card bg-raised"
        />
      )}

      {link.state === 'disconnected' && (
        <ConnectCard
          onConnect={link.connect}
          connecting={link.connecting}
          waiting={link.waiting}
          onCancel={link.cancelWaiting}
          onRecheck={link.recheck}
          error={link.error}
        />
      )}

      {showCalendar && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="radiogroup"
              aria-label="Calendar view"
              className="inline-flex overflow-hidden rounded-lg border border-line"
            >
              {(['week', 'agenda'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={`min-h-touch px-5 text-sm font-medium capitalize ${
                    view === v
                      ? 'bg-accent/20 text-accent-ink'
                      : 'text-muted hover:bg-raised hover:text-ink'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {view === 'week' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous week"
                  onClick={() => setWeekStart((w) => addDays(w, -7))}
                  className={btn}
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setWeekStart(startOfWeek(new Date()))}
                  className={btn}
                >
                  Today
                </button>
                <button
                  type="button"
                  aria-label="Next week"
                  onClick={() => setWeekStart((w) => addDays(w, 7))}
                  className={btn}
                >
                  ›
                </button>
                <span className="text-sm font-medium" aria-live="polite">
                  {rangeLabel}
                </span>
              </div>
            )}
            {view === 'agenda' && (
              <span className="text-sm text-muted">Next {AGENDA_DAYS} days</span>
            )}
          </div>

          {query.data && query.data.skipped > 0 && (
            <p role="note" className="text-sm text-muted">
              {query.data.skipped} event{query.data.skipped === 1 ? '' : 's'} could not be read and{' '}
              {query.data.skipped === 1 ? 'was' : 'were'} left out.
            </p>
          )}

          <PanelState
            isLoading={query.isLoading}
            error={query.error}
            onRetry={() => void query.refetch()}
            isEmpty={events.length === 0}
            emptyTitle="Nothing on your calendar"
            emptyHint="Events from Google Calendar will appear here."
          >
            {view === 'week' ? (
              <ol
                aria-label="Week"
                className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-start gap-3"
              >
                {days.map(({ day, events: list }) => {
                  const today = isSameDay(day, now);
                  return (
                    <li
                      key={day.toISOString()}
                      aria-label={longDayFmt.format(day)}
                      data-today={today}
                    >
                      <h2
                        className={`mb-2 text-sm font-semibold ${today ? 'text-accent-ink' : 'text-muted'}`}
                      >
                        {dayFmt.format(day)}
                        {today && <span className="ml-2 text-xs">Today</span>}
                      </h2>
                      <ul className="space-y-2">
                        {list.map((e) => (
                          <li key={e.id}>
                            <EventItem event={e} day={day} now={now} />
                          </li>
                        ))}
                        {list.length === 0 && (
                          <li className="text-xs text-muted">Nothing scheduled</li>
                        )}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            ) : isEmpty ? (
              <div className="rounded-card border border-line bg-surface p-6 text-center">
                <p className="font-medium">Nothing scheduled</p>
                <p className="mt-1 text-sm text-muted">The next {AGENDA_DAYS} days are clear.</p>
              </div>
            ) : (
              <ol aria-label="Agenda" className="space-y-5">
                {days.map(({ day, events: list }) => (
                  <li key={day.toISOString()}>
                    <h2 className="mb-2 text-sm font-semibold text-muted">
                      {longDayFmt.format(day)}
                      {isSameDay(day, now) && (
                        <span className="ml-2 text-xs text-accent-ink">Today</span>
                      )}
                    </h2>
                    <ul className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
                      {list.map((e) => (
                        <li key={e.id}>
                          <EventItem event={e} day={day} now={now} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </PanelState>
        </>
      )}

      {link.state === 'connected' && link.error && (
        <p role="alert" className="text-sm text-status-error">
          {link.error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title="Disconnect Google Calendar?"
        confirmLabel={link.disconnecting ? 'Disconnecting…' : 'Disconnect'}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          link.disconnect();
        }}
      >
        The agent will stop seeing your events. You can connect again any time.
      </ConfirmDialog>
    </section>
  );
}
