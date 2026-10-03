export type WidgetMode = 'always' | 'running' | 'off';

export interface VisibilityInput {
  mode: WidgetMode;
  /** The Command Center window is shown and not minimized. */
  mainVisible: boolean;
  /** Number of tasks that would be planets (starting, running, paused or waiting for approval). */
  activeCount: number;
  /** False on platforms where the widget cannot work (Wayland). */
  supported: boolean;
}

/** The widget shows when the main window is hidden or minimized, subject to the user's mode. */
export function shouldShowWidget({
  mode,
  mainVisible,
  activeCount,
  supported,
}: VisibilityInput): boolean {
  if (!supported || mode === 'off' || mainVisible) return false;
  return mode === 'always' || activeCount > 0;
}
