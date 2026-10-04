import { deriveEventState, stateLabel, type EventState } from './state';

const T = new Date('2026-10-03T12:00:00Z');
const at = (min: number) => new Date(T.getTime() + min * 60_000);
const ev = (startMin: number, endMin: number, id = 'e') => ({
  id,
  start: at(startMin),
  end: at(endMin),
});

describe('deriveEventState', () => {
  it('ended when the end is in the past', () => {
    expect(deriveEventState(ev(-90, -30), T)).toBe('ended');
  });

  it('in progress when now is inside the event (end is inclusive, start too)', () => {
    expect(deriveEventState(ev(-10, 20), T)).toBe('in progress');
    expect(deriveEventState(ev(-10, 0), T)).toBe('in progress');
    expect(deriveEventState(ev(0, 30), T)).toBe('in progress');
  });

  it('active when it is the active context block', () => {
    expect(deriveEventState(ev(-10, 20), T, { activeBlockId: 'e' })).toBe('active');
    expect(deriveEventState(ev(-10, 20, 'other'), T, { activeBlockId: 'e' })).toBe('in progress');
  });

  it('ended beats active; active beats starting soon and deferred', () => {
    expect(deriveEventState(ev(-90, -30), T, { activeBlockId: 'e' })).toBe('ended');
    expect(deriveEventState(ev(5, 30), T, { activeBlockId: 'e', deferredIds: ['e'] })).toBe(
      'active',
    );
  });

  it('starting soon within 15 minutes, upcoming beyond', () => {
    expect(deriveEventState(ev(15, 60), T)).toBe('starting soon');
    expect(deriveEventState(ev(1, 60), T)).toBe('starting soon');
    expect(
      deriveEventState({ id: 'e', start: new Date(T.getTime() + 15 * 60_000 + 1), end: at(90) }, T),
    ).toBe('upcoming');
    expect(deriveEventState(ev(120, 180), T)).toBe('upcoming');
  });

  it('deferred when listed (array or Set), unless an earlier rule applies', () => {
    expect(deriveEventState(ev(120, 180), T, { deferredIds: ['e'] })).toBe('deferred');
    expect(deriveEventState(ev(120, 180), T, { deferredIds: new Set(['e']) })).toBe('deferred');
    expect(deriveEventState(ev(120, 180), T, { deferredIds: ['nope'] })).toBe('upcoming');
    expect(deriveEventState(ev(5, 60), T, { deferredIds: ['e'] })).toBe('starting soon');
  });

  it('no context means no active or deferred', () => {
    expect(deriveEventState(ev(120, 180), T, {})).toBe('upcoming');
    expect(deriveEventState(ev(120, 180), T, { activeBlockId: null })).toBe('upcoming');
  });

  it('every state has a text label', () => {
    const states: EventState[] = [
      'ended',
      'active',
      'in progress',
      'starting soon',
      'deferred',
      'upcoming',
    ];
    for (const s of states) expect(stateLabel[s].length).toBeGreaterThan(0);
    expect(new Set(states.map((s) => stateLabel[s])).size).toBe(states.length);
  });
});
