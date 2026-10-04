import { useEffect, useRef, useState, type RefObject } from 'react';
import { getFrameEntry, subscribeFrames, type FrameEntry } from '@/state/frameStore';

export const RENDER_INTERVAL_MS = 400;
export const NO_SIGNAL_MS = 5000;

export interface LayerPreview {
  src: string | undefined;
  noSignal: boolean;
}

/**
 * Throttled view of a layer's frame stream. Keeps the last frame, flags "no signal"
 * after 5s without frames, and stops updating while the tab is hidden or the tile is offscreen.
 */
export function useLayerPreview(layerId: string, ref: RefObject<Element | null>): LayerPreview {
  const [entry, setEntry] = useState<FrameEntry | undefined>(() => getFrameEntry(layerId));
  const [noSignal, setNoSignal] = useState(() => !getFrameEntry(layerId));
  const visible = useRef(true);

  useEffect(() => {
    let lastRender = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;
    let inView = true;

    const apply = () => {
      const latest = getFrameEntry(layerId);
      // Only a real frame starts the throttle clock, so the first frame renders immediately.
      if (latest) lastRender = Date.now();
      setEntry(latest);
    };
    const recompute = () => {
      const wasVisible = visible.current;
      visible.current = inView && !document.hidden;
      if (visible.current && !wasVisible) apply();
    };
    const onFrame = () => {
      if (!visible.current) return;
      const wait = RENDER_INTERVAL_MS - (Date.now() - lastRender);
      if (wait <= 0) apply();
      else if (pending === undefined) {
        pending = setTimeout(() => {
          pending = undefined;
          if (visible.current) apply();
        }, wait);
      }
    };
    const checkSignal = () => {
      if (!visible.current) return;
      const latest = getFrameEntry(layerId);
      setNoSignal(!latest || Date.now() - latest.receivedAt > NO_SIGNAL_MS);
    };

    const unsubscribe = subscribeFrames(layerId, onFrame);
    const interval = setInterval(checkSignal, 1000);
    document.addEventListener('visibilitychange', recompute);

    let observer: IntersectionObserver | undefined;
    const el = ref.current;
    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        recompute();
      });
      observer.observe(el);
    }
    // Pick up a frame that arrived between render and subscribe.
    apply();
    checkSignal();

    return () => {
      unsubscribe();
      clearInterval(interval);
      if (pending !== undefined) clearTimeout(pending);
      document.removeEventListener('visibilitychange', recompute);
      observer?.disconnect();
    };
  }, [layerId, ref]);

  return {
    src: entry ? `data:image/jpeg;base64,${entry.frame.jpegBase64}` : undefined,
    noSignal,
  };
}
