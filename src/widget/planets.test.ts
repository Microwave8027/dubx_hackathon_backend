import type { Approval, Layer, Step, Task } from '@/api/types';
import {
  MAX_PLANETS,
  ORB,
  attentionCount,
  needsAttention,
  PLANET_RADIUS,
  progressOf,
  planetStatusText,
  planetStepText,
  planetTarget,
  selectPlanets,
  sunState,
  type WidgetData,
} from './planets';

const step = (status: Step['status'], i = 0): Step => ({ id: `s${i}`, text: `Step ${i}`, status });
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  text: `Task ${id}`,
  status: 'running',
  weight: 'routine',
  createdAt: `2026-01-01T00:00:${id.padStart(2, '0')}Z`,
  ...extra,
});
const layer = (id: string, extra: Partial<Layer> = {}): Layer => ({
  id: `l${id}`,
  taskId: id,
  status: 'running',
  steps: [],
  usesScreen: false,
  ...extra,
});
const approval = (layerId: string, extra: Partial<Approval> = {}): Approval => ({
  id: `a-${layerId}`,
  layerId,
  taskId: layerId.slice(1),
  action: { category: 'write_files', summary: 'Write a file' },
  status: 'pending',
  createdAt: '2026-01-01T00:00:00Z',
  ...extra,
});

function data(tasks: Task[], layers: Layer[], approvals: Approval[] = []): WidgetData {
  return {
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    layers: Object.fromEntries(layers.map((l) => [l.id, l])),
    approvals: Object.fromEntries(approvals.map((a) => [a.id, a])),
  };
}

describe('selectPlanets', () => {
  it('includes starting, running, paused and waiting layers only', () => {
    const statuses = [
      'starting',
      'running',
      'paused',
      'waiting_approval',
      'done',
      'error',
      'killed',
    ] as const;
    const ids = statuses.map((_, i) => String(i + 1));
    const sel = selectPlanets(
      data(
        ids.map((id) => task(id)),
        ids.map((id, i) => layer(id, { status: statuses[i] })),
      ),
    );
    expect(sel.total).toBe(4);
    expect(sel.planets.map((p) => p.status).sort()).toEqual(
      ['paused', 'running', 'starting', 'waiting_approval'].sort(),
    );
  });

  it('orders needs-you first, then running, starting, paused, then oldest task', () => {
    const sel = selectPlanets(
      data(
        [task('1'), task('2'), task('3'), task('4'), task('5')],
        [
          layer('1', { status: 'paused' }),
          layer('2', { status: 'starting' }),
          layer('3', { status: 'running' }),
          layer('4', { status: 'waiting_approval' }),
          layer('5', { status: 'running' }),
        ],
      ),
    );
    expect(sel.planets.map((p) => p.taskId)).toEqual(['4', '3', '5', '2', '1']);
  });

  it('caps visible planets at 7 and reports the overflow', () => {
    const ids = Array.from({ length: 10 }, (_, i) => String(i + 1));
    const sel = selectPlanets(
      data(
        ids.map((id) => task(id)),
        ids.map((id) => layer(id)),
      ),
    );
    expect(sel.planets).toHaveLength(MAX_PLANETS);
    expect(sel.overflow).toBe(3);
    expect(sel.total).toBe(10);
  });

  it('has no overflow at exactly 7', () => {
    const ids = Array.from({ length: 7 }, (_, i) => String(i + 1));
    const sel = selectPlanets(
      data(
        ids.map((id) => task(id)),
        ids.map((id) => layer(id)),
      ),
    );
    expect(sel.overflow).toBe(0);
  });

  it('keeps waiting planets visible when the cap cuts others', () => {
    const ids = Array.from({ length: 9 }, (_, i) => String(i + 1));
    const layers = ids.map((id) =>
      layer(id, { status: id === '9' ? 'waiting_approval' : 'running' }),
    );
    const sel = selectPlanets(
      data(
        ids.map((id) => task(id)),
        layers,
      ),
    );
    expect(sel.planets[0]?.taskId).toBe('9');
  });

  it('marks a layer with a pending approval as waiting and links the approval', () => {
    const sel = selectPlanets(data([task('1')], [layer('1')], [approval('l1')]));
    expect(sel.planets[0]).toMatchObject({ status: 'waiting_approval', approvalId: 'a-l1' });
  });

  it('ignores resolved approvals and picks the oldest pending one', () => {
    const sel = selectPlanets(
      data(
        [task('1')],
        [layer('1')],
        [
          approval('l1', { id: 'new', createdAt: '2026-01-01T00:05:00Z' }),
          approval('l1', { id: 'old', createdAt: '2026-01-01T00:01:00Z' }),
          approval('l1', { id: 'done', status: 'approved', createdAt: '2025-01-01T00:00:00Z' }),
        ],
      ),
    );
    expect(sel.planets[0]?.approvalId).toBe('old');
  });

  it('maps weight to size', () => {
    const sel = selectPlanets(
      data(
        [task('1', { weight: 'judgment' }), task('2', { weight: 'routine' })],
        [layer('1'), layer('2')],
      ),
    );
    const byTask = Object.fromEntries(sel.planets.map((p) => [p.taskId, p.radius]));
    expect(byTask['1']).toBe(PLANET_RADIUS.judgment);
    expect(byTask['2']).toBe(PLANET_RADIUS.routine);
    expect(PLANET_RADIUS.judgment).toBeGreaterThan(PLANET_RADIUS.routine);
  });

  it('maps steps to progress and picks the current step', () => {
    const sel = selectPlanets(
      data(
        [task('1')],
        [
          layer('1', {
            steps: [step('done', 0), step('done', 1), step('active', 2), step('pending', 3)],
          }),
        ],
      ),
    );
    expect(sel.planets[0]).toMatchObject({
      stepsDone: 2,
      stepsTotal: 4,
      progress: 0.5,
      currentStep: 'Step 2',
    });
  });

  it('falls back to the first pending step and to no step', () => {
    const pending = selectPlanets(
      data([task('1')], [layer('1', { steps: [step('done', 0), step('pending', 1)] })]),
    );
    expect(pending.planets[0]?.currentStep).toBe('Step 1');
    const none = selectPlanets(data([task('1')], [layer('1')]));
    expect(none.planets[0]?.currentStep).toBeUndefined();
    expect(none.planets[0]?.progress).toBe(0);
  });

  it('still shows a planet when the task has not arrived yet', () => {
    const sel = selectPlanets(data([], [layer('1')]));
    expect(sel.planets[0]).toMatchObject({ text: 'Untitled task', weight: 'routine' });
  });

  it('is empty with nothing running', () => {
    expect(selectPlanets(data([], []))).toEqual({ planets: [], overflow: 0, total: 0 });
  });
});

describe('progressOf', () => {
  it('clamps and handles zero steps', () => {
    expect(progressOf(0, 0)).toBe(0);
    expect(progressOf(3, 4)).toBe(0.75);
    expect(progressOf(5, 4)).toBe(1);
    expect(progressOf(-1, 4)).toBe(0);
  });
});

describe('sunState', () => {
  it('is idle with nothing running or only paused work', () => {
    expect(sunState(data([], []))).toBe('idle');
    expect(sunState(data([task('1')], [layer('1', { status: 'paused' })]))).toBe('idle');
  });

  it('is working when something runs or starts', () => {
    expect(sunState(data([task('1')], [layer('1', { status: 'running' })]))).toBe('working');
    expect(sunState(data([task('1')], [layer('1', { status: 'starting' })]))).toBe('working');
  });

  it('is needs-you for a pending approval or a waiting layer, beating working', () => {
    expect(sunState(data([task('1')], [layer('1')], [approval('l1')]))).toBe('needs-you');
    expect(
      sunState(
        data([task('1'), task('2')], [layer('1'), layer('2', { status: 'waiting_approval' })]),
      ),
    ).toBe('needs-you');
  });

  it('ignores resolved approvals', () => {
    expect(sunState(data([task('1')], [layer('1')], [approval('l1', { status: 'denied' })]))).toBe(
      'working',
    );
  });
});

describe('attention', () => {
  it('only needs-you asks for attention; the palette is fixed', () => {
    expect(needsAttention('needs-you')).toBe(true);
    expect(needsAttention('working')).toBe(false);
    expect(needsAttention('idle')).toBe(false);
    expect(Object.values(ORB)).toHaveLength(3);
  });

  it('counts pending approvals, else waiting planets', () => {
    const waiting = selectPlanets(data([task('1')], [layer('1', { status: 'waiting_approval' })]));
    expect(attentionCount(3, waiting)).toBe(3);
    expect(attentionCount(0, waiting)).toBe(1);
    expect(attentionCount(0, selectPlanets(data([], [])))).toBe(0);
  });
});

describe('planet click target and label text', () => {
  const one = (extra: Partial<Layer> = {}, approvals: Approval[] = []) =>
    selectPlanets(data([task('1')], [layer('1', extra)], approvals)).planets[0]!;

  it('opens the layer, or the approval when the planet is waiting on one', () => {
    expect(planetTarget(one())).toEqual({ layerId: 'l1' });
    expect(planetTarget(one({}, [approval('l1')]))).toEqual({ approvalId: 'a-l1' });
  });

  it('opens the layer when it is waiting but no approval has arrived yet', () => {
    expect(planetTarget(one({ status: 'waiting_approval' }))).toEqual({ layerId: 'l1' });
  });

  it('describes status and step', () => {
    expect(planetStatusText('waiting_approval')).toBe('Waiting for approval');
    expect(planetStatusText('paused')).toBe('Paused');
    const steps = [step('done', 0), step('active', 1), step('pending', 2)];
    expect(planetStepText(one({ steps }))).toBe('Step 2 of 3: Step 1');
    expect(planetStepText(one())).toBe('No steps yet');
    expect(planetStepText(one({ steps: [step('done', 0), step('done', 1)] }))).toBe(
      '2 of 2 steps done',
    );
  });
});
