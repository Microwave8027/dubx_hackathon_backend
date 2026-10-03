// Calendar payload generator for the mock daemon. Times are relative to "now" so the demo
// always has a current event and upcoming ones. Shape: docs/calendar-payload.md.

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const iso = (ms) => new Date(ms).toISOString();

function timed(now, id, title, startMin, durMin, extra = {}) {
  const start = now + startMin * MIN;
  return {
    id,
    title,
    start: iso(start),
    end: iso(start + durMin * MIN),
    allDay: false,
    calendar: 'School',
    color: '#4285f4',
    location: null,
    description: null,
    status: 'confirmed',
    ...extra,
  };
}

function baseEvents(now) {
  const today = new Date(now);
  const tomorrow = new Date(now + DAY);
  return [
    timed(now, 'evt_current', 'Math homework', -20, 75),
    timed(now, 'evt_soon', 'English homework', 10, 60, {
      status: 'tentative',
      description: 'Essay draft https://docs.google.com/document/d/example',
    }),
    timed(now, 'evt_later', 'Study group', 180, 60, { calendar: 'Friends', color: '#0b8043' }),
    {
      id: 'evt_allday',
      title: 'Spirit Week',
      start: localDate(today),
      end: localDate(tomorrow),
      allDay: true,
      calendar: 'School',
    },
    timed(now, 'evt_tomorrow', 'Soccer practice', 24 * 60 + 60, 90, {
      calendar: 'Sports',
      color: '#d50000',
      location: 'Memorial Field',
    }),
    timed(now, 'evt_cancelled', 'Pop quiz (cancelled)', 90, 30, { status: 'cancelled' }),
  ];
}

/** About a month of daily events, plus some earlier today that have already ended. */
function fullEvents(now) {
  const events = baseEvents(now);
  events.push(timed(now, 'evt_ended', 'Morning review', -240, 45, { calendar: 'Work' }));
  for (let d = 1; d <= 30; d++) {
    events.push(timed(now, `evt_d${d}_a`, `Class block ${d}`, d * 24 * 60 - 60, 50));
    events.push(
      timed(now, `evt_d${d}_b`, `Practice ${d}`, d * 24 * 60 + 240, 90, {
        calendar: 'Sports',
        color: '#d50000',
      }),
    );
  }
  return events;
}

function messyEvents(now) {
  return [
    ...baseEvents(now),
    timed(now, 'bad_end', 'Ends before it starts', 60, -30),
    { id: 'bad_time', title: 'Garbage time', start: 'next tuesday-ish', end: 'later' },
    { id: 'bad_missing', title: 'Missing start' },
    'not even an object',
    null,
    // Valid but odd: aliases, a Google-style time, and epoch seconds.
    {
      id: 'odd_google',
      summary: 'Google-style event',
      start: { dateTime: iso(now + 5 * 60 * MIN) },
      end: { dateTime: iso(now + 6 * 60 * MIN) },
      calendar_name: 'Google',
    },
    { id: 'odd_epoch', title: 'Epoch seconds', startTime: Math.floor((now + 7 * 60 * MIN) / 1000) },
  ];
}

/** mode: "default" | "full" | "bad". pushed: counter for snapshot pushes (makes each one visibly different). */
export function buildSchedule(mode, now = Date.now(), pushed = 0) {
  const events =
    mode === 'full' ? fullEvents(now) : mode === 'bad' ? messyEvents(now) : baseEvents(now);
  if (pushed > 0) {
    events.push(
      timed(now, `evt_push_${pushed}`, `Pushed snapshot #${pushed}`, 30, 30, { calendar: 'Mock' }),
    );
  }
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    fetchedAt: iso(now),
    events,
  };
}
