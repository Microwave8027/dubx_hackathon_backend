/** Native widget window sizes in logical pixels. */
export const WIDGET_SIZES = {
  collapsed: { width: 96, height: 48 },
  expanded: { width: 320, height: 320 },
} as const;

/** Used only when the OS does not report a work area, so the widget clears a typical dock or taskbar. */
export const FALLBACK_DOCK_MARGIN = 48;
export const MAX_BOTTOM_MARGIN = 200;

interface Point {
  x: number;
  y: number;
}
interface Extent {
  width: number;
  height: number;
}

/** The slice of Tauri's Monitor this module needs. All values are physical pixels. */
export interface MonitorInfo {
  position: Point;
  size: Extent;
  scaleFactor: number;
  workArea?: { position: Point; size: Extent };
}

/** A rectangle in physical pixels, ready for PhysicalPosition and PhysicalSize. */
export interface PhysicalRect extends Point, Extent {}

/** Bottom margin in logical px. Without a reported work area, never go below the dock fallback. */
export function effectiveMargin(monitor: MonitorInfo, margin: number): number {
  const m = Number.isFinite(margin) ? Math.min(Math.max(margin, 0), MAX_BOTTOM_MARGIN) : 0;
  return monitor.workArea ? m : Math.max(m, FALLBACK_DOCK_MARGIN);
}

/**
 * Bottom-right corner of the monitor's work area (or the whole monitor when none is reported).
 * `size` and `margin` are logical px and are scaled by the monitor's scale factor. The window is
 * clamped so it never starts left of or above the area, even if it is larger than the area.
 */
export function anchorRect(monitor: MonitorInfo, size: Extent, margin: number): PhysicalRect {
  const scale = monitor.scaleFactor > 0 ? monitor.scaleFactor : 1;
  const area = monitor.workArea ?? { position: monitor.position, size: monitor.size };
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const bottomGap = Math.round(Math.max(margin, 0) * scale);
  return {
    x: Math.max(area.position.x, area.position.x + area.size.width - width),
    y: Math.max(area.position.y, area.position.y + area.size.height - height - bottomGap),
    width,
    height,
  };
}
