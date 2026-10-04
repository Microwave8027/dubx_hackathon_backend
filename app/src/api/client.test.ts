import { task } from '@/test/fixtures';
import { createDirectTransport } from '@/transport/direct';
import { ApiError, createApiClient } from './client';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function clientWith(f: ReturnType<typeof vi.fn>, base = '') {
  const transport = createDirectTransport({
    baseUrl: () => base,
    fetch: f as unknown as typeof fetch,
  });
  return createApiClient(() => transport);
}

describe('api client', () => {
  it('builds URLs from the configured base and parses responses', async () => {
    const f = vi.fn().mockReturnValue(json([task()]));
    const tasks = await clientWith(f, 'http://daemon').listTasks();
    expect(tasks[0]?.id).toBe('t1');
    expect(f.mock.calls[0]?.[0]).toBe('http://daemon/tasks');
  });

  it('rejects payloads that fail schema validation', async () => {
    const f = vi.fn().mockReturnValue(json([{ id: 't1' }]));
    await expect(clientWith(f).listTasks()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with the status on HTTP failure', async () => {
    const f = vi.fn().mockReturnValue(json({}, 500));
    await expect(clientWith(f).approve('a1')).rejects.toMatchObject({ status: 500 });
  });

  it('reports non-JSON error pages by status alone', async () => {
    const f = vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(clientWith(f).listTasks()).rejects.toMatchObject({ status: 502 });
  });

  it('sends JSON bodies and encodes log filters', async () => {
    const f = vi.fn().mockImplementation(() => json([]));
    await clientWith(f).listLog({ layerId: 'l 1', category: 'move_files' });
    expect(f.mock.calls[0]?.[0]).toBe('/log?layerId=l+1&category=move_files');
  });

  it('POSTs the redirect instruction as JSON', async () => {
    const f = vi
      .fn()
      .mockImplementation(() =>
        json({ id: 'l1', taskId: 't1', status: 'running', steps: [], usesScreen: false }),
      );
    await clientWith(f).redirectLayer('l1', 'do it differently');
    const init = f.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ instruction: 'do it differently' });
  });
});
