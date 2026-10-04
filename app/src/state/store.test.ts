import { approval, layer, task } from '@/test/fixtures';
import { clearFrames, getFrame } from './frameStore';
import { selectPendingApprovals, selectPendingCount, useLiveStore } from './store';

beforeEach(() => {
  useLiveStore.setState({
    tasks: {},
    layers: {},
    approvals: {},
    connection: 'closed',
    briefingTick: 0,
  });
  clearFrames();
});

describe('live store', () => {
  it('hydrates from REST data', () => {
    useLiveStore
      .getState()
      .hydrate({ tasks: [task()], layers: [layer()], approvals: [approval()] });
    expect(useLiveStore.getState().tasks['t1']?.text).toBe('Organize Downloads');
    expect(selectPendingCount(useLiveStore.getState())).toBe(1);
  });

  it('applies task, layer and approval events', () => {
    const { applyEvent } = useLiveStore.getState();
    applyEvent({ type: 'task.updated', data: task({ status: 'done' }) });
    applyEvent({ type: 'layer.updated', data: layer({ status: 'paused' }) });
    applyEvent({ type: 'approval.requested', data: approval() });
    const s = useLiveStore.getState();
    expect(s.tasks['t1']?.status).toBe('done');
    expect(s.layers['l1']?.status).toBe('paused');
    expect(selectPendingApprovals(s)).toHaveLength(1);
    applyEvent({ type: 'approval.resolved', data: approval({ status: 'approved' }) });
    expect(selectPendingCount(useLiveStore.getState())).toBe(0);
  });

  it('keeps frames out of the store state', () => {
    const before = useLiveStore.getState();
    useLiveStore
      .getState()
      .applyEvent({ type: 'layer.frame', data: { layerId: 'l1', ts: 1, jpegBase64: 'abc' } });
    expect(useLiveStore.getState()).toBe(before);
    expect(getFrame('l1')?.jpegBase64).toBe('abc');
  });

  it('counts briefing.ready events', () => {
    useLiveStore.getState().applyEvent({
      type: 'briefing.ready',
      data: {
        id: 'b',
        kind: 'morning',
        generatedAt: 'x',
        summary: '',
        finished: [],
        approvalIds: [],
      },
    });
    expect(useLiveStore.getState().briefingTick).toBe(1);
  });
});
