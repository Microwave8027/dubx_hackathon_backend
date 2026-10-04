// @vitest-environment node
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAssistantMock } from './assistant.js';
import { buildSchedule } from './schedule.js';

const mock = createAssistantMock();
let base = '';
let close: () => void = () => {};

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  const getSchedule = () => buildSchedule('default', Date.now(), 0);
  mock.register(app, getSchedule);
  app.get('/schedule', (_req, res) => res.json(mock.applyTo(getSchedule())));
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());
beforeEach(() => mock.reset());

const post = (path: string, body: unknown) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const schedule = async () =>
  (
    (await (await fetch(base + '/schedule')).json()) as {
      events: { id: string; title: string; start: string; end: string }[];
    }
  ).events;

describe('POST /schedule/assist', () => {
  it('returns a proposal in the backend’s shape and changes nothing', async () => {
    const before = await schedule();
    const res = await post('/schedule/assist', { prompt: 'Add focus time', timeZone: 'UTC' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: string;
      warnings: string[];
      operations: { op: string }[];
    };
    expect(body.summary).toBeTruthy();
    expect(body.warnings).toEqual([]);
    expect(body.operations[0]).toMatchObject({ op: 'create', name: 'Deep work' });
    const after = await schedule(); // times are relative to now, so compare what is there, not when
    expect(after.map((e) => [e.id, e.title])).toEqual(before.map((e) => [e.id, e.title]));
  });

  it('proposes deleting events when asked to clear time, and moving when asked to move', async () => {
    const clear = (await (
      await post('/schedule/assist', { prompt: 'Clear my afternoon' })
    ).json()) as { operations: { op: string; id: string }[] };
    expect(clear.operations.length).toBeGreaterThan(0);
    expect(clear.operations.every((o) => o.op === 'delete' && o.id)).toBe(true);
    const move = (await (
      await post('/schedule/assist', { prompt: 'Move my first meeting later' })
    ).json()) as { operations: { op: string; start: string; stop: string }[] };
    expect(move.operations).toHaveLength(1);
    expect(move.operations[0]).toMatchObject({ op: 'update' });
    expect(Date.parse(move.operations[0]!.stop)).toBeGreaterThan(
      Date.parse(move.operations[0]!.start),
    );
  });

  it('can say nothing needs to change, and can warn', async () => {
    const none = (await (await post('/schedule/assist', { prompt: 'make no changes' })).json()) as {
      operations: unknown[];
    };
    expect(none.operations).toEqual([]);
    const warn = (await (
      await post('/schedule/assist', { prompt: 'add something that may overlap' })
    ).json()) as { warnings: string[] };
    expect(warn.warnings).toHaveLength(1);
  });

  it('validates the prompt like the backend', async () => {
    expect((await post('/schedule/assist', { prompt: '   ' })).status).toBe(400);
    expect((await post('/schedule/assist', {})).status).toBe(400);
    expect((await post('/schedule/assist', { prompt: 'x'.repeat(4001) })).status).toBe(400);
  });

  it('reports an AI failure as 502', async () => {
    const res = await post('/schedule/assist', { prompt: 'trigger gemini-error' });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'Gemini returned an invalid response' });
  });

  it('is 401 when not signed in', async () => {
    mock.setSignedIn(false);
    expect((await post('/schedule/assist', { prompt: 'hi' })).status).toBe(401);
    expect(
      (await post('/schedule/batch', { operations: [{ op: 'delete', id: 'x' }] })).status,
    ).toBe(401);
  });
});

describe('applyTo', () => {
  it('leaves junk entries of the messy payload untouched', () => {
    const junk = [null, 'nope', 7, { title: 'no id' }];
    const out = mock.applyTo({ events: [...junk, { id: 'a', title: 'A' }] });
    expect(out.events.slice(0, 4)).toEqual(junk);
  });
});

describe('POST /schedule/batch', () => {
  it('applies create, update and delete so the calendar really changes', async () => {
    const before = await schedule();
    const target = before[0]!;
    const res = await post('/schedule/batch', {
      timeZone: 'UTC',
      operations: [
        {
          op: 'create',
          name: 'New thing',
          start: '2026-10-06T09:00:00.000Z',
          stop: '2026-10-06T10:00:00.000Z',
        },
        {
          op: 'update',
          id: target.id,
          name: 'Renamed',
          start: '2026-10-06T11:00:00.000Z',
          stop: '2026-10-06T12:00:00.000Z',
          color: '#d50000',
        },
        { op: 'delete', id: before[1]!.id },
      ],
    });
    expect(res.status).toBe(200);
    const { results } = (await res.json()) as {
      results: { op: string; ok: boolean; id: string | null }[];
    };
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(results[0]?.id).toMatch(/^mock_/);

    const after = await schedule();
    expect(after.some((e) => e.title === 'New thing')).toBe(true);
    expect(after.find((e) => e.id === target.id)?.title).toBe('Renamed');
    expect(after.some((e) => e.id === before[1]!.id)).toBe(false);
  });

  it('reports each operation on its own, including a failure', async () => {
    const res = await post('/schedule/batch', {
      operations: [
        { op: 'delete', id: 'missing_event' },
        {
          op: 'create',
          name: 'Ok',
          start: '2026-10-06T09:00:00.000Z',
          stop: '2026-10-06T10:00:00.000Z',
        },
      ],
    });
    const { results } = (await res.json()) as { results: { ok: boolean; error?: string }[] };
    expect(results[0]).toMatchObject({ ok: false, error: 'Event not found' });
    expect(results[1]).toMatchObject({ ok: true });
  });

  it('rejects bad bodies', async () => {
    expect((await post('/schedule/batch', { operations: [] })).status).toBe(400);
    expect((await post('/schedule/batch', { operations: [{ op: 'explode' }] })).status).toBe(400);
    const backwards = await post('/schedule/batch', {
      operations: [
        {
          op: 'create',
          name: 'x',
          start: '2026-10-06T10:00:00.000Z',
          stop: '2026-10-06T09:00:00.000Z',
        },
      ],
    });
    expect(backwards.status).toBe(400);
    const badColor = await post('/schedule/batch', {
      operations: [
        {
          op: 'create',
          name: 'x',
          start: '2026-10-06T09:00:00.000Z',
          stop: '2026-10-06T10:00:00.000Z',
          color: 'red',
        },
      ],
    });
    expect(badColor.status).toBe(400);
    const tooMany = await post('/schedule/batch', {
      operations: Array.from({ length: 101 }, (_, i) => ({ op: 'delete', id: `e${i}` })),
    });
    expect(tooMany.status).toBe(400);
  });
});
