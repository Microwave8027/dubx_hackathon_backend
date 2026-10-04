import { MAX_PLANETS } from './planets';

/** The widget canvas is a fixed 320x320 stage anchored to the bottom-right of the native window. */
export const STAGE_SIZE = 320;
export const SUN_BOX = 96;

/** The sun's centre in stage px: resting (half sun, flat edge on the window bottom) and expanded. */
export const SUN_CENTER = {
  collapsed: { x: STAGE_SIZE - SUN_BOX / 2, y: STAGE_SIZE },
  expanded: { x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 },
} as const;
export const SUN_EXPANDED_SCALE = 1.25;

export const RING_START = 66;
export const RING_STEP = 10;
/** 7 planets plus the "+N" planet. */
export const RING_COUNT = MAX_PLANETS + 1;

export const ringRadius = (index: number): number => RING_START + index * RING_STEP;

const GOLDEN_ANGLE = 137.50776405;
/** Spread start angles so neighbouring rings do not line up. Degrees in [0, 360). */
export const startAngle = (index: number): number => (index * GOLDEN_ANGLE) % 360;

/** Each ring turns at a slightly different speed (seconds per lap). */
export const orbitSeconds = (index: number): number => 40 + index * 6;

/** SVG progress arc around a planet: full circumference and the dash offset for `progress`. */
export function progressArc(radius: number, progress: number) {
  const circumference = 2 * Math.PI * radius;
  const p = Math.min(1, Math.max(0, progress));
  return { circumference, dashOffset: circumference * (1 - p) };
}

/** Translation that moves the resting sun to the expanded position (before scaling). */
export const SUN_SHIFT = {
  x: SUN_CENTER.expanded.x - SUN_CENTER.collapsed.x,
  y: SUN_CENTER.expanded.y - SUN_CENTER.collapsed.y,
} as const;

/** Outer edge of the outermost planet ring, which must stay inside the stage. */
export const OUTER_EXTENT = (maxPlanetRadius: number): number =>
  ringRadius(RING_COUNT - 1) + maxPlanetRadius + 4;
