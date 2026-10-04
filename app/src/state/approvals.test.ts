import { approval } from '@/test/fixtures';
import { decideApproval } from './approvals';
import { useLiveStore } from './store';

beforeEach(() => {
  useLiveStore.setState({ approvals: { a1: approval() } });
});

describe('decideApproval', () => {
  it('optimistically approves, then settles on the server result', async () => {
    let resolve!: (a: ReturnType<typeof approval>) => void;
    const client = {
      approve: vi.fn(() => new Promise<ReturnType<typeof approval>>((r) => (resolve = r))),
      deny: vi.fn(),
    };
    const p = decideApproval(client, 'a1', 'approve');
    expect(useLiveStore.getState().approvals['a1']?.status).toBe('approved');
    resolve(approval({ status: 'approved', resolvedAt: 'now' }));
    await p;
    expect(useLiveStore.getState().approvals['a1']?.resolvedAt).toBe('now');
  });

  it('rolls back and rethrows when the API fails', async () => {
    const client = { approve: vi.fn(), deny: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(decideApproval(client, 'a1', 'deny')).rejects.toThrow('boom');
    expect(useLiveStore.getState().approvals['a1']?.status).toBe('pending');
  });

  it('does not roll back over a newer server state', async () => {
    const client = {
      approve: vi.fn().mockImplementation(async () => {
        useLiveStore
          .getState()
          .applyEvent({ type: 'approval.resolved', data: approval({ status: 'expired' }) });
        throw new Error('conflict');
      }),
      deny: vi.fn(),
    };
    await expect(decideApproval(client, 'a1', 'approve')).rejects.toThrow();
    expect(useLiveStore.getState().approvals['a1']?.status).toBe('expired');
  });
});
