import { task } from '@/test/fixtures';
import { ApiError, createApiClient } from './client';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('api client', () => {
  it('builds URLs from the configured base and parses responses', async () => {
    const f = vi.fn().mockReturnValue(json([task()]));
    const c = createApiClient(() => 'http://daemon', f as unknown as typeof fetch);
    const tasks = await c.listTasks();
    expect(tasks[0]?.id).toBe('t1');
    expect(f.mock.calls[0]?.[0]).toBe('http://daemon/tasks');
  });

  it('rejects payloads that fail schema validation', async () => {
    const f = vi.fn().mockReturnValue(json([{ id: 't1' }]));
    const c = createApiClient(() => '', f as unknown as typeof fetch);
    await expect(c.listTasks()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with the status on HTTP failure', async () => {
    const f = vi.fn().mockReturnValue(json({}, 500));
    const c = createApiClient(() => '', f as unknown as typeof fetch);
    await expect(c.approve('a1')).rejects.toMatchObject({ status: 500 });
  });

  it('sends JSON bodies and encodes log filters', async () => {
    const f = vi.fn().mockImplementation(() => json([]));
    const c = createApiClient(() => '', f as unknown as typeof fetch);
    await c.listLog({ layerId: 'l 1', category: 'move_files' });
    expect(f.mock.calls[0]?.[0]).toBe('/log?layerId=l+1&category=move_files');
  });
});
