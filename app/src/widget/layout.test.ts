import { PLANET_RADIUS } from './planets';
import {
  OUTER_EXTENT,
  RING_COUNT,
  STAGE_SIZE,
  SUN_CENTER,
  SUN_SHIFT,
  orbitSeconds,
  progressArc,
  ringRadius,
  startAngle,
} from './layout';

describe('layout', () => {
  it('puts the resting sun flat on the bottom edge, centred in the 96px-wide collapsed window', () => {
    expect(SUN_CENTER.collapsed).toEqual({ x: 272, y: 320 });
    expect(SUN_SHIFT).toEqual({ x: -112, y: -160 });
  });

  it('gives every planet its own ring, widening outwards', () => {
    const radii = Array.from({ length: RING_COUNT }, (_, i) => ringRadius(i));
    expect(new Set(radii).size).toBe(RING_COUNT);
    expect([...radii].sort((a, b) => a - b)).toEqual(radii);
  });

  it('keeps the largest planet on the outermost ring inside the stage', () => {
    expect(OUTER_EXTENT(PLANET_RADIUS.judgment)).toBeLessThanOrEqual(STAGE_SIZE / 2);
  });

  it('turns each ring at a different speed and starts planets at different angles', () => {
    const speeds = Array.from({ length: RING_COUNT }, (_, i) => orbitSeconds(i));
    expect(new Set(speeds).size).toBe(RING_COUNT);
    const angles = Array.from({ length: RING_COUNT }, (_, i) => startAngle(i));
    expect(new Set(angles.map((a) => Math.round(a))).size).toBe(RING_COUNT);
    angles.forEach((a) => {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(360);
    });
  });
});

describe('progressArc', () => {
  it('maps progress to a dash offset', () => {
    const { circumference, dashOffset } = progressArc(10, 0.25);
    expect(circumference).toBeCloseTo(2 * Math.PI * 10);
    expect(dashOffset).toBeCloseTo(circumference * 0.75);
  });

  it('is empty at 0, full at 1, and clamps', () => {
    expect(progressArc(10, 0).dashOffset).toBeCloseTo(progressArc(10, 0).circumference);
    expect(progressArc(10, 1).dashOffset).toBe(0);
    expect(progressArc(10, 5).dashOffset).toBe(0);
    expect(progressArc(10, -1).dashOffset).toBeCloseTo(progressArc(10, 0).circumference);
  });
});
