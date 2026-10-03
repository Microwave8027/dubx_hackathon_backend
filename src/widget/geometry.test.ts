import { FALLBACK_DOCK_MARGIN, anchorRect, effectiveMargin, type MonitorInfo } from './geometry';

const size = { width: 96, height: 48 };

function monitor(partial: Partial<MonitorInfo> = {}): MonitorInfo {
  return {
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1080 },
    scaleFactor: 1,
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
    ...partial,
  };
}

describe('anchorRect', () => {
  it('sits flush in the bottom-right of the work area', () => {
    expect(anchorRect(monitor(), size, 0)).toEqual({ x: 1824, y: 992, width: 96, height: 48 });
  });

  it('lifts the window by the bottom margin', () => {
    expect(anchorRect(monitor(), size, 12).y).toBe(980);
  });

  it('scales size and margin by the scale factor', () => {
    const m = monitor({
      size: { width: 3840, height: 2160 },
      scaleFactor: 2,
      workArea: { position: { x: 0, y: 0 }, size: { width: 3840, height: 2080 } },
    });
    expect(anchorRect(m, size, 10)).toEqual({ x: 3648, y: 1964, width: 192, height: 96 });
  });

  it('handles fractional scale factors by rounding to whole physical pixels', () => {
    const m = monitor({
      scaleFactor: 1.25,
      size: { width: 2400, height: 1350 },
      workArea: { position: { x: 0, y: 0 }, size: { width: 2400, height: 1310 } },
    });
    expect(anchorRect(m, size, 0)).toEqual({ x: 2280, y: 1250, width: 120, height: 60 });
  });

  it('respects a monitor and work area that do not start at the origin', () => {
    const m = monitor({
      position: { x: -1920, y: 100 },
      workArea: { position: { x: -1920, y: 100 }, size: { width: 1920, height: 1000 } },
    });
    expect(anchorRect(m, size, 0)).toEqual({ x: -96, y: 1052, width: 96, height: 48 });
  });

  it('excludes a left dock and top menu bar offset from the work area', () => {
    const m = monitor({
      workArea: { position: { x: 70, y: 25 }, size: { width: 1850, height: 1055 } },
    });
    expect(anchorRect(m, size, 0)).toEqual({ x: 1824, y: 1032, width: 96, height: 48 });
  });

  it('falls back to the whole monitor when no work area is reported', () => {
    expect(anchorRect(monitor({ workArea: undefined }), size, 0)).toEqual({
      x: 1824,
      y: 1032,
      width: 96,
      height: 48,
    });
  });

  it('anchors the expanded size to the same corner', () => {
    expect(anchorRect(monitor(), { width: 320, height: 320 }, 0)).toEqual({
      x: 1600,
      y: 720,
      width: 320,
      height: 320,
    });
  });

  it('never starts outside the area when the window is larger than it', () => {
    const m = monitor({
      workArea: { position: { x: 10, y: 20 }, size: { width: 50, height: 30 } },
    });
    const r = anchorRect(m, size, 0);
    expect(r.x).toBe(10);
    expect(r.y).toBe(20);
  });

  it('treats a bad scale factor as 1 and a negative margin as 0', () => {
    expect(anchorRect(monitor({ scaleFactor: 0 }), size, -5)).toEqual({
      x: 1824,
      y: 992,
      width: 96,
      height: 48,
    });
  });
});

describe('effectiveMargin', () => {
  it('uses the configured margin when a work area is known', () => {
    expect(effectiveMargin(monitor(), 0)).toBe(0);
    expect(effectiveMargin(monitor(), 20)).toBe(20);
  });

  it('clears a typical dock when there is no work area', () => {
    const m = monitor({ workArea: undefined });
    expect(effectiveMargin(m, 0)).toBe(FALLBACK_DOCK_MARGIN);
    expect(effectiveMargin(m, 80)).toBe(80);
  });

  it('clamps nonsense values', () => {
    expect(effectiveMargin(monitor(), -10)).toBe(0);
    expect(effectiveMargin(monitor(), 9999)).toBe(200);
    expect(effectiveMargin(monitor(), Number.NaN)).toBe(0);
  });
});
