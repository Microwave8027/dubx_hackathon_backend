import { vi } from 'vitest';
import type { Transport } from '@/transport/types';

const request = vi.fn();
vi.mock('@/transport', () => ({ getTransport: () => ({ request }) as unknown as Transport }));

import { AssistantError, applyOperations, assist } from './api';

beforeEach(() => {
  request.mockReset();
});

const proposal = {
  summary: 'Moved your gym session.',
  warnings: ['Overlaps with lunch'],
  operations: [
    {
      op: 'update',
      id: 'e1',
      name: 'Gym',
      start: '2026-10-05T17:00:00.000Z',
      stop: '2026-10-05T18:00:00.000Z',
      color: '#039BE5',
    },
    { op: 'delete', id: 'e2' },
  ],
};

describe('assist', () => {
  it('posts the prompt with the time zone and returns the proposal', async () => {
    request.mockResolvedValue({ status: 200, json: proposal });
    const result = await assist('Move gym to 6pm', 'Europe/Dublin');
    expect(request).toHaveBeenCalledWith('POST', '/schedule/assist', {
      prompt: 'Move gym to 6pm',
      timeZone: 'Europe/Dublin',
    });
    expect(result.summary).toBe('Moved your gym session.');
    expect(result.operations).toHaveLength(2);
  });

  it('defaults a missing summary and warnings', async () => {
    request.mockResolvedValue({ status: 200, json: { operations: [] } });
    await expect(assist('nothing', 'UTC')).resolves.toEqual({
      summary: '',
      warnings: [],
      operations: [],
    });
  });

  it('uses the browser time zone when none is given', async () => {
    request.mockResolvedValue({ status: 200, json: { operations: [] } });
    await assist('x');
    const tz = (request.mock.calls[0]?.[2] as { timeZone: string }).timeZone;
    expect(tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('flags a 401 as needing sign-in', async () => {
    request.mockResolvedValue({ status: 401, json: { error: 'Not signed in' } });
    const err = await assist('x', 'UTC').catch((e) => e);
    expect(err).toBeInstanceOf(AssistantError);
    expect(err).toMatchObject({ status: 401, needsSignIn: true, message: 'Not signed in' });
  });

  it('shows the server’s message for a bad request or an AI failure', async () => {
    request.mockResolvedValue({ status: 400, json: { error: 'prompt: Too small' } });
    await expect(assist('', 'UTC')).rejects.toThrow('prompt: Too small');
    request.mockResolvedValue({ status: 502, json: {} });
    await expect(assist('x', 'UTC')).rejects.toThrow(/AI service had a problem/);
  });

  it('reports an unreachable server', async () => {
    request.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(assist('x', 'UTC')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects an answer in the wrong shape', async () => {
    request.mockResolvedValue({ status: 200, json: { operations: [{ op: 'explode' }] } });
    await expect(assist('x', 'UTC')).rejects.toThrow(/could not read/);
  });
});

describe('null fields from the AI', () => {
  it('accepts a null description and colour, and omits them when applying', async () => {
    request.mockResolvedValueOnce({
      status: 200,
      json: {
        operations: [
          { op: 'create', name: 'X', description: null, start: 'a', stop: 'b', color: null },
        ],
      },
    });
    const p = await assist('x', 'UTC');
    expect(p.operations).toHaveLength(1);

    request.mockResolvedValueOnce({
      status: 200,
      json: { results: [{ op: 'create', id: 'n', ok: true }] },
    });
    await applyOperations(p.operations, 'UTC');
    const sent = (request.mock.calls[1]?.[2] as { operations: Record<string, unknown>[] })
      .operations[0]!;
    expect('description' in sent).toBe(false);
    expect('color' in sent).toBe(false);
    expect(sent).toMatchObject({ op: 'create', name: 'X' });
  });
});

describe('applyOperations', () => {
  it('sends the operations without the explanation and returns the per-operation results', async () => {
    request.mockResolvedValue({
      status: 200,
      json: {
        results: [
          { op: 'delete', id: 'e2', ok: true },
          { op: 'create', id: null, ok: false, error: 'quota' },
        ],
      },
    });
    const results = await applyOperations(
      [
        { op: 'delete', id: 'e2', reason: 'clearing Friday' },
        { op: 'create', name: 'X', start: 'a', stop: 'b', reason: 'because' },
      ],
      'UTC',
    );
    const sent = request.mock.calls[0]?.[2] as {
      timeZone: string;
      operations: Record<string, unknown>[];
    };
    expect(request.mock.calls[0]?.[1]).toBe('/schedule/batch');
    expect(sent.timeZone).toBe('UTC');
    expect(sent.operations.every((o) => !('reason' in o))).toBe(true);
    expect(results).toEqual([
      { op: 'delete', id: 'e2', ok: true },
      { op: 'create', id: null, ok: false, error: 'quota' },
    ]);
  });
});
