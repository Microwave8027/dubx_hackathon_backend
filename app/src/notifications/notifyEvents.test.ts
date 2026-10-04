import { approval, layer, task } from '@/test/fixtures';
import { notifyForEvent } from './notifyEvents';

const setup = (focused: boolean) => {
  const notify = vi.fn().mockResolvedValue(undefined);
  return { notify, deps: { platform: { notify }, isFocused: () => focused } };
};

describe('notifyForEvent', () => {
  it('notifies for a new approval when unfocused, deep-linking to approvals', async () => {
    const { notify, deps } = setup(false);
    await notifyForEvent({ type: 'approval.requested', data: approval() }, undefined, deps);
    expect(notify).toHaveBeenCalledWith({
      title: 'Needs your decision',
      body: 'Send an email',
      deepLink: '/approvals',
    });
  });

  it('stays quiet while the window is focused', async () => {
    const { notify, deps } = setup(true);
    await notifyForEvent({ type: 'approval.requested', data: approval() }, undefined, deps);
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies once when a task transitions to done', async () => {
    const { notify, deps } = setup(false);
    const done = task({ status: 'done', layerId: 'l1' });
    await notifyForEvent({ type: 'task.updated', data: done }, task({ status: 'running' }), deps);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Task finished', deepLink: '/layers/l1' }),
    );
    notify.mockClear();
    await notifyForEvent({ type: 'task.updated', data: done }, done, deps);
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies for briefing.ready and ignores unrelated events', async () => {
    const { notify, deps } = setup(false);
    await notifyForEvent(
      {
        type: 'briefing.ready',
        data: {
          id: 'b',
          kind: 'morning',
          generatedAt: 'x',
          summary: 'All good',
          finished: [],
          approvalIds: [],
        },
      },
      undefined,
      deps,
    );
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ deepLink: '/briefing' }));
    notify.mockClear();
    await notifyForEvent({ type: 'layer.updated', data: layer() }, undefined, deps);
    expect(notify).not.toHaveBeenCalled();
  });

  it('swallows notification failures', async () => {
    const deps = {
      platform: { notify: vi.fn().mockRejectedValue(new Error('denied')) },
      isFocused: () => false,
    };
    await expect(
      notifyForEvent({ type: 'approval.requested', data: approval() }, undefined, deps),
    ).resolves.toBeUndefined();
  });
});
