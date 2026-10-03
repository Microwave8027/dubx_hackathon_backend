export type HoverPhase = 'collapsed' | 'growing' | 'expanded' | 'collapsing';

export const HOVER_INTENT_MS = 120;
export const LEAVE_DELAY_MS = 400;
/** Matches the 250ms sun and planet transition in widget.css (plus a frame of slack). */
export const COLLAPSE_ANIMATION_MS = 260;

export interface HoverSequenceOptions {
  /** Resizes the native window. Resolves when the window has its new size. */
  setNativeExpanded(expanded: boolean): Promise<void>;
  onPhase(phase: HoverPhase): void;
}

export interface HoverSequence {
  pointerEnter(): void;
  pointerLeave(): void;
  /**
   * Expand or collapse now, skipping the hover-intent and leave delays (buttons, tests).
   * An expandNow stays open, even with the pointer elsewhere, until collapseNow.
   */
  expandNow(): void;
  collapseNow(): void;
  dispose(): void;
}

/**
 * The widget's hover choreography, kept out of React so the ordering is easy to test:
 *  - enter: wait 120ms, grow the native window, THEN animate the sun open.
 *  - leave: wait 400ms (cancelled if the pointer returns), animate closed, THEN shrink the window.
 * The native window is never resized while an animation is running.
 */
export function createHoverSequence(options: HoverSequenceOptions): HoverSequence {
  let phase: HoverPhase = 'collapsed';
  let inside = false;
  let pinned = false;
  let disposed = false;
  let intentTimer: ReturnType<typeof setTimeout> | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;
  let animTimer: ReturnType<typeof setTimeout> | null = null;

  const set = (next: HoverPhase) => {
    phase = next;
    if (!disposed) options.onPhase(next);
  };
  const clear = (t: ReturnType<typeof setTimeout> | null) => {
    if (t) clearTimeout(t);
    return null;
  };

  function scheduleLeave(delay: number) {
    leaveTimer = clear(leaveTimer);
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      collapse();
    }, delay);
  }

  async function grow() {
    if (phase !== 'collapsed') return;
    set('growing');
    try {
      await options.setNativeExpanded(true);
    } catch {
      if (!disposed) set('collapsed');
      return;
    }
    if (disposed) return;
    set('expanded');
    if (!inside && !pinned) scheduleLeave(LEAVE_DELAY_MS);
  }

  function collapse() {
    if (phase !== 'expanded') return;
    set('collapsing'); // the CSS transition runs now; the window keeps its size
    animTimer = clear(animTimer);
    animTimer = setTimeout(() => {
      animTimer = null;
      void (async () => {
        try {
          await options.setNativeExpanded(false);
        } catch {
          /* stay as we are; the next hover retries */
        }
        if (disposed) return;
        set('collapsed');
        if (inside) scheduleIntent();
      })();
    }, COLLAPSE_ANIMATION_MS);
  }

  function scheduleIntent() {
    intentTimer = clear(intentTimer);
    intentTimer = setTimeout(() => {
      intentTimer = null;
      void grow();
    }, HOVER_INTENT_MS);
  }

  return {
    pointerEnter() {
      inside = true;
      leaveTimer = clear(leaveTimer);
      if (phase === 'collapsing' && animTimer) {
        // Back before the window shrank: just reverse the animation.
        animTimer = clear(animTimer);
        set('expanded');
      } else if (phase === 'collapsed') {
        scheduleIntent();
      }
    },
    pointerLeave() {
      inside = false;
      intentTimer = clear(intentTimer);
      if (phase === 'expanded' && !pinned) scheduleLeave(LEAVE_DELAY_MS);
    },
    expandNow() {
      pinned = true;
      leaveTimer = clear(leaveTimer);
      intentTimer = clear(intentTimer);
      if (phase === 'collapsing' && animTimer) {
        animTimer = clear(animTimer);
        set('expanded');
      } else void grow();
    },
    collapseNow() {
      pinned = false;
      intentTimer = clear(intentTimer);
      leaveTimer = clear(leaveTimer);
      collapse();
    },
    dispose() {
      disposed = true;
      intentTimer = clear(intentTimer);
      leaveTimer = clear(leaveTimer);
      animTimer = clear(animTimer);
    },
  };
}
