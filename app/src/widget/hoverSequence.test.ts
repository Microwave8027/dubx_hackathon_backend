import {
  COLLAPSE_ANIMATION_MS,
  HOVER_INTENT_MS,
  LEAVE_DELAY_MS,
  createHoverSequence,
  type HoverPhase,
} from './hoverSequence';

function setup(nativeDelayMs = 0) {
  const log: string[] = [];
  const phases: HoverPhase[] = [];
  const seq = createHoverSequence({
    async setNativeExpanded(expanded) {
      log.push(`native:${expanded ? 'grow' : 'shrink'}`);
      if (nativeDelayMs) await new Promise((r) => setTimeout(r, nativeDelayMs));
    },
    onPhase(p) {
      phases.push(p);
      log.push(`phase:${p}`);
    },
  });
  return { seq, log, phases };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('hover sequence', () => {
  it('waits for hover intent, grows the window, then expands', async () => {
    const { seq, log } = setup();
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS - 1);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toEqual(['phase:growing', 'native:grow', 'phase:expanded']);
  });

  it('does nothing for a pass-through hover shorter than the intent delay', async () => {
    const { seq, log } = setup();
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS - 20);
    seq.pointerLeave();
    await vi.advanceTimersByTimeAsync(2000);
    expect(log).toEqual([]);
  });

  it('keeps the expanded animation waiting until the native window has resized', async () => {
    const { seq, log } = setup(80);
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS + 40);
    expect(log).toEqual(['phase:growing', 'native:grow']); // still resizing: no animation yet
    await vi.advanceTimersByTimeAsync(60);
    expect(log.at(-1)).toBe('phase:expanded');
  });

  it('on leave waits 400ms, animates back, and only then shrinks the window', async () => {
    const { seq, log } = setup();
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS);
    log.length = 0;

    seq.pointerLeave();
    await vi.advanceTimersByTimeAsync(LEAVE_DELAY_MS - 1);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toEqual(['phase:collapsing']); // animation starts, window untouched
    await vi.advanceTimersByTimeAsync(COLLAPSE_ANIMATION_MS - 1);
    expect(log).toEqual(['phase:collapsing']);
    await vi.advanceTimersByTimeAsync(1);
    expect(log).toEqual(['phase:collapsing', 'native:shrink', 'phase:collapsed']);
  });

  it('cancels the collapse if the pointer returns within 400ms', async () => {
    const { seq, log } = setup();
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS);
    log.length = 0;
    seq.pointerLeave();
    await vi.advanceTimersByTimeAsync(LEAVE_DELAY_MS - 50);
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(2000);
    expect(log).toEqual([]);
  });

  it('reverses the animation, without resizing, if the pointer returns mid-collapse', async () => {
    const { seq, log } = setup();
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS);
    seq.pointerLeave();
    await vi.advanceTimersByTimeAsync(LEAVE_DELAY_MS + 100);
    log.length = 0;
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(2000);
    expect(log).toEqual(['phase:expanded']);
  });

  it('collapses on its own if the pointer left while the window was still growing', async () => {
    const { seq, phases } = setup(100);
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS + 10);
    seq.pointerLeave();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(phases).toEqual(['growing', 'expanded', 'collapsing', 'collapsed']);
  });

  it('expands again if the pointer is still over the corner after shrinking', async () => {
    const { seq, phases } = setup();
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS);
    seq.collapseNow();
    await vi.advanceTimersByTimeAsync(COLLAPSE_ANIMATION_MS + HOVER_INTENT_MS + 5);
    expect(phases).toEqual([
      'growing',
      'expanded',
      'collapsing',
      'collapsed',
      'growing',
      'expanded',
    ]);
  });

  it('expandNow and collapseNow skip the delays', async () => {
    const { seq, phases } = setup();
    seq.expandNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(phases).toEqual(['growing', 'expanded']);
    seq.collapseNow();
    await vi.advanceTimersByTimeAsync(COLLAPSE_ANIMATION_MS);
    expect(phases.at(-1)).toBe('collapsed');
  });

  it('an expandNow stays open with the pointer elsewhere until collapseNow', async () => {
    const { seq, phases } = setup();
    seq.expandNow();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(phases).toEqual(['growing', 'expanded']);
    seq.pointerEnter();
    seq.pointerLeave();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(phases).toEqual(['growing', 'expanded']);
    seq.collapseNow();
    await vi.advanceTimersByTimeAsync(COLLAPSE_ANIMATION_MS);
    expect(phases.at(-1)).toBe('collapsed');
  });

  it('stays collapsed if the native resize fails', async () => {
    const phases: HoverPhase[] = [];
    const seq = createHoverSequence({
      setNativeExpanded: () => Promise.reject(new Error('no window')),
      onPhase: (p) => phases.push(p),
    });
    seq.pointerEnter();
    await vi.advanceTimersByTimeAsync(HOVER_INTENT_MS);
    expect(phases).toEqual(['growing', 'collapsed']);
  });

  it('does nothing after dispose', async () => {
    const { seq, log } = setup();
    seq.pointerEnter();
    seq.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(log).toEqual([]);
  });
});
