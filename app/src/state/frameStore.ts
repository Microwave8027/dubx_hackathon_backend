import type { Frame } from '@/api/types';

export interface FrameEntry {
  frame: Frame;
  /** Local receive time; used for "no signal" so server clock skew cannot break it. */
  receivedAt: number;
}

// Frames arrive ~2 fps per layer. They live outside React state with per-layer
// subscribers, so a frame for one layer never re-renders anything else.
const frames = new Map<string, FrameEntry>();
const listeners = new Map<string, Set<() => void>>();

export function pushFrame(frame: Frame): void {
  frames.set(frame.layerId, { frame, receivedAt: Date.now() });
  listeners.get(frame.layerId)?.forEach((l) => l());
}

export function getFrameEntry(layerId: string): FrameEntry | undefined {
  return frames.get(layerId);
}

export function getFrame(layerId: string): Frame | undefined {
  return frames.get(layerId)?.frame;
}

export function clearFrames(): void {
  frames.clear();
}

export function subscribeFrames(layerId: string, cb: () => void): () => void {
  let set = listeners.get(layerId);
  if (!set) {
    set = new Set();
    listeners.set(layerId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(layerId);
  };
}
