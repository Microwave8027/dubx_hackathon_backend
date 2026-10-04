import { vi } from 'vitest';
import { ApiError } from '@/transport/errors';
import { setTransport } from '@/transport';
import type { Transport } from '@/transport/types';
import {
  createHttpCalendarSource,
  createTauriCalendarSource,
  TAURI_CALENDAR_COMMAND,
} from './source';

const invokeCommand = vi.hoisted(() => vi.fn());
vi.mock('@/platform', async (orig) => ({
  ...(await orig<typeof import('@/platform')>()),
  invokeCommand,
}));

const canonical = {
  timezone: 'UTC',
  events: [{ id: 'a', title: 'A', start: '2026-10-03T10:00:00Z', end: '2026-10-03T11:00:00Z' }],
};

function fakeTransport(status: number, json: unknown) {
  const request = vi.fn().mockResolvedValue({ status, json });
  const t: Transport = { kind: 'direct', request, openEvents: () => ({ close() {} }) };
  setTransport(t);
  return request;
}

describe('HttpCalendarSource', () => {
  it('GETs /schedule with no query string by default and returns normalized data', async () => {
    const request = fakeTransport(200, canonical);
    const ds = await createHttpCalendarSource().load();
    expect(request).toHaveBeenCalledWith('GET', '/schedule');
    expect(ds.events[0]?.start).toBeInstanceOf(Date);
    expect(ds.timezone).toBe('UTC');
  });

  it('sends from/to only when a range is provided (the backend may ignore them)', async () => {
    const request = fakeTransport(200, canonical);
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-08T00:00:00Z');
    await createHttpCalendarSource({ getRange: () => ({ from, to }) }).load();
    expect(request.mock.calls[0]?.[1]).toBe(
      '/schedule?from=2026-10-01T00%3A00%3A00.000Z&to=2026-10-08T00%3A00%3A00.000Z',
    );
  });

  it('throws ApiError on HTTP failure and CalendarFormatError on an unusable body', async () => {
    fakeTransport(503, null);
    await expect(createHttpCalendarSource().load()).rejects.toBeInstanceOf(ApiError);
    fakeTransport(200, { not: 'a calendar' });
    await expect(createHttpCalendarSource().load()).rejects.toMatchObject({
      name: 'CalendarFormatError',
    });
  });

  it('ingest normalizes a pushed payload for subscribers and ignores a malformed one', () => {
    const src = createHttpCalendarSource();
    const got = vi.fn();
    const off = src.subscribe(got);
    src.ingest?.(canonical);
    expect(got).toHaveBeenCalledTimes(1);
    expect(got.mock.calls[0]?.[0].events).toHaveLength(1);
    src.ingest?.('garbage');
    expect(got).toHaveBeenCalledTimes(1);
    off();
    src.ingest?.(canonical);
    expect(got).toHaveBeenCalledTimes(1);
  });
});

describe('TauriCalendarSource', () => {
  beforeEach(() => {
    invokeCommand.mockReset();
  });

  it('calls the Rust command and normalizes an object result', async () => {
    invokeCommand.mockResolvedValue(canonical);
    const ds = await createTauriCalendarSource().load();
    expect(invokeCommand).toHaveBeenCalledWith(TAURI_CALENDAR_COMMAND);
    expect(ds.events).toHaveLength(1);
  });

  it('also accepts the dataset as a JSON string', async () => {
    invokeCommand.mockResolvedValue(JSON.stringify(canonical));
    expect((await createTauriCalendarSource().load()).events).toHaveLength(1);
  });

  it('rejects when the command fails', async () => {
    invokeCommand.mockImplementation(async () => {
      throw new Error('command not found');
    });
    await expect(createTauriCalendarSource().load()).rejects.toThrow('command not found');
  });
});
