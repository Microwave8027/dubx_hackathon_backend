import { useSyncExternalStore } from 'react';
import type { Frame } from '@/api/types';

// Frames arrive ~2 fps per layer. They live outside React state and each layer
// has its own subscribers, so a frame for one layer never re-renders another.
const frames = new Map<string, Frame>();
const listeners = new Map<string, Set<() => void>>();

export function pushFrame(frame: Frame): void {
  frames.set(frame.layerId, frame);
  listeners.get(frame.layerId)?.forEach((l) => l());
}

export function getFrame(layerId: string): Frame | undefined {
  return frames.get(layerId);
}

export function clearFrames(): void {
  frames.clear();
}

function subscribe(layerId: string, cb: () => void): () => void {
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

export function useLayerFrame(layerId: string): Frame | undefined {
  return useSyncExternalStore(
    (cb) => subscribe(layerId, cb),
    () => frames.get(layerId),
  );
}
