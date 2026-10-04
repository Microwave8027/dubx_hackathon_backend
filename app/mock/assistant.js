// Stand-in for the backend's POST /schedule/assist (Gemini) and POST /schedule/batch, with the same
// request and response shapes (docs/assistant.md). The "AI" is a few keyword rules so the demo is
// predictable: it is not a model. Edits are applied to what GET /schedule returns, so the calendar
// really changes after Apply.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const HOUR = 60 * 60_000;
const MAX_OPERATIONS = 100;
const isoOrDate = z.coerce.date();
const eventFields = {
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  start: isoOrDate,
  stop: isoOrDate,
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB')
    .default('#039BE5')
    .transform((c) => c.toUpperCase()),
};
const AssistBody = z.object({
  prompt: z.string().trim().min(1).max(4000),
  timeZone: z.string().optional(),
});
const BatchBody = z.object({
  timeZone: z.string().optional(),
  operations: z
    .array(
      z.discriminatedUnion('op', [
        z.object({ op: z.literal('create'), ...eventFields }),
        z.object({ op: z.literal('update'), id: z.string().min(1), ...eventFields }),
        z.object({ op: z.literal('delete'), id: z.string().min(1) }),
      ]),
    )
    .min(1)
    .max(MAX_OPERATIONS)
    .refine((ops) => ops.every((o) => o.op === 'delete' || o.stop > o.start), {
      message: 'stop must be after start',
    }),
});

const firstIssue = (e) => `${e.issues[0]?.path.join('.') || 'body'}: ${e.issues[0]?.message}`;

export function createAssistantMock() {
  const state = { signedIn: true, created: [], updated: new Map(), deleted: new Set() };

  /** Deterministic proposal from the prompt. `events` are the schedule's events, as served. */
  function propose(prompt, events, now = Date.now()) {
    const text = prompt.toLowerCase();
    const upcoming = events
      .filter((e) => e && typeof e === 'object' && typeof e.id === 'string' && e.start && e.end)
      .filter((e) => !e.allDay && Date.parse(e.end) > now)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const warnings = text.includes('overlap')
      ? ['Some of these changes overlap with existing events.']
      : [];

    if (text.includes('nothing') || text.includes('no change')) {
      return {
        summary: 'Your calendar already matches that, so I left it alone.',
        warnings,
        operations: [],
      };
    }
    if (text.includes('fail')) {
      return {
        summary: 'Removed two events (one of them no longer exists, to show a partial failure).',
        warnings,
        operations: [
          { op: 'delete', id: upcoming[0]?.id ?? 'evt_math', reason: 'Requested' },
          { op: 'delete', id: 'missing_event', reason: 'Already gone' },
        ],
      };
    }
    if (/clear|cancel|remove/.test(text)) {
      const targets = upcoming.slice(0, 2);
      return {
        summary: `Removed ${targets.length} upcoming event${targets.length === 1 ? '' : 's'}.`,
        warnings,
        operations: targets.map((e) => ({
          op: 'delete',
          id: e.id,
          reason: 'You asked to clear time.',
        })),
      };
    }
    if (/move|shift|later|reschedule/.test(text) && upcoming[0]) {
      const e = upcoming[0];
      return {
        summary: `Moved "${e.title}" an hour later.`,
        warnings,
        operations: [
          {
            op: 'update',
            id: e.id,
            name: e.title,
            description: e.description ?? '',
            start: new Date(Date.parse(e.start) + HOUR).toISOString(),
            stop: new Date(Date.parse(e.end) + HOUR).toISOString(),
            color: e.color ?? '#039BE5',
            reason: 'One hour later, as requested.',
          },
        ],
      };
    }
    const start = new Date(now);
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
    return {
      summary: 'Added a focus block tomorrow morning.',
      warnings,
      operations: [
        {
          op: 'create',
          name: 'Deep work',
          description: prompt.slice(0, 200),
          start: start.toISOString(),
          stop: new Date(start.getTime() + 2 * HOUR).toISOString(),
          color: '#039BE5',
          reason: 'Two quiet hours before the day fills up.',
        },
      ],
    };
  }

  function applyOps(operations) {
    return operations.map((o) => {
      if (o.op === 'create') {
        const id = `mock_${randomUUID().slice(0, 8)}`;
        state.created.push({ id, ...pickEvent(o) });
        return { op: 'create', id, ok: true };
      }
      if (o.id === 'missing_event')
        return { op: o.op, id: o.id, ok: false, error: 'Event not found' };
      if (o.op === 'update') {
        state.updated.set(o.id, pickEvent(o));
        return { op: 'update', id: o.id, ok: true };
      }
      state.deleted.add(o.id);
      return { op: 'delete', id: o.id, ok: true };
    });
  }

  const pickEvent = (o) => ({
    title: o.name,
    description: o.description,
    start: o.start.toISOString(),
    end: o.stop.toISOString(),
    color: o.color,
  });

  return {
    state,
    setSignedIn: (v) => {
      state.signedIn = v;
    },
    reset() {
      state.signedIn = true;
      state.created.length = 0;
      state.updated.clear();
      state.deleted.clear();
    },
    /** Applies accepted edits to a schedule payload as GET /schedule would show them. */
    applyTo(schedule) {
      // The "messy payload" mode contains junk entries on purpose; leave those exactly as they are.
      const real = (e) => e !== null && typeof e === 'object' && typeof e.id === 'string';
      const events = schedule.events
        .filter((e) => !(real(e) && state.deleted.has(e.id)))
        .map((e) =>
          real(e) && state.updated.has(e.id) ? { ...e, ...state.updated.get(e.id) } : e,
        );
      return {
        ...schedule,
        events: [
          ...events,
          ...state.created.map((c) => ({
            ...c,
            allDay: false,
            calendar: 'Assistant',
            status: 'confirmed',
          })),
        ],
      };
    },
    /** Registers POST /schedule/assist and /schedule/batch; `getSchedule` returns the unedited schedule. */
    register(app, getSchedule) {
      const guard = (_req, res, next) =>
        state.signedIn ? next() : res.status(401).json({ error: 'Not signed in' });

      app.post('/schedule/assist', guard, (req, res) => {
        const parsed = AssistBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
        if (parsed.data.prompt.toLowerCase().includes('gemini-error')) {
          return res.status(502).json({ error: 'Gemini returned an invalid response' });
        }
        res.json(propose(parsed.data.prompt, this.applyTo(getSchedule()).events));
      });

      app.post('/schedule/batch', guard, (req, res) => {
        const parsed = BatchBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: firstIssue(parsed.error) });
        res.json({ results: applyOps(parsed.data.operations) });
      });

      app.post('/__mock/assistant', (req, res) => {
        state.signedIn = req.query.signedIn !== 'false';
        res.json({ ok: true, signedIn: state.signedIn });
      });
    },
    propose,
  };
}
