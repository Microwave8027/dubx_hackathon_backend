import { approval, layer } from '@/test/fixtures';
import { useLiveStore } from './store';
import { selectTrayState } from './trayState';

const set = (a: ReturnType<typeof approval>[], l: ReturnType<typeof layer>[]) =>
  useLiveStore.setState({
    approvals: Object.fromEntries(a.map((x) => [x.id, x])),
    layers: Object.fromEntries(l.map((x) => [x.id, x])),
  });

describe('tray state', () => {
  it('is idle with nothing happening', () => {
    set([], [layer({ status: 'done' }), layer({ id: 'l2', status: 'paused' })]);
    expect(selectTrayState(useLiveStore.getState())).toBe('idle');
  });

  it('is working when any layer runs', () => {
    set([], [layer({ status: 'running' })]);
    expect(selectTrayState(useLiveStore.getState())).toBe('working');
  });

  it('is needs-you when any approval is pending, even while layers run', () => {
    set([approval()], [layer({ status: 'running' })]);
    expect(selectTrayState(useLiveStore.getState())).toBe('needs-you');
  });

  it('drops back once the approval is resolved', () => {
    set([approval({ status: 'approved' })], [layer({ status: 'running' })]);
    expect(selectTrayState(useLiveStore.getState())).toBe('working');
  });
});
