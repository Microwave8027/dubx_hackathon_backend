import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { Platform, TrayState } from '@/platform';
import { WidgetCanvas } from './WidgetCanvas';
import { createHoverSequence, type HoverPhase, type HoverSequence } from './hoverSequence';
import { planetTarget, type Planet, type PlanetSelection } from './planets';
import type { WidgetSettings } from './settings';

export interface WidgetControls {
  expandNow(): void;
  collapseNow(): void;
}

export interface WidgetSurfaceProps {
  platform: Platform;
  selection: PlanetSelection;
  state: TrayState;
  pendingCount: number;
  settings: Pick<WidgetSettings, 'reduceMotion' | 'opaque' | 'bottomMargin'>;
  /** Lets the preview page drive the same choreography from buttons. */
  controlsRef?: MutableRefObject<WidgetControls | null>;
}

/** Fills its (positioned) parent: wires hover choreography and clicks to the platform adapter. */
export function WidgetSurface({
  platform,
  selection,
  state,
  pendingCount,
  settings,
  controlsRef,
}: WidgetSurfaceProps) {
  const osReduce = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [phase, setPhase] = useState<HoverPhase>('collapsed');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const seq = useRef<HoverSequence | null>(null);
  const margin = useRef(settings.bottomMargin);
  useEffect(() => {
    margin.current = settings.bottomMargin;
  }, [settings.bottomMargin]);

  useEffect(() => {
    const s = createHoverSequence({
      setNativeExpanded: (expanded) => platform.setWidgetExpanded(expanded, margin.current),
      onPhase: setPhase,
    });
    seq.current = s;
    if (controlsRef) controlsRef.current = { expandNow: s.expandNow, collapseNow: s.collapseNow };
    return () => {
      s.dispose();
      seq.current = null;
      if (controlsRef) controlsRef.current = null;
    };
  }, [platform, controlsRef]);

  const open = (target?: Parameters<Platform['openCommandCenter']>[0]) =>
    void platform.openCommandCenter(target)?.catch(() => {});

  return (
    <div
      className="absolute inset-0"
      onPointerEnter={() => seq.current?.pointerEnter()}
      onPointerLeave={() => {
        setHoveredId(null);
        seq.current?.pointerLeave();
      }}
    >
      <WidgetCanvas
        selection={selection}
        state={state}
        pendingCount={pendingCount}
        expanded={phase === 'expanded'}
        reduceMotion={settings.reduceMotion || osReduce}
        opaque={settings.opaque}
        hoveredId={hoveredId}
        onHover={setHoveredId}
        onSun={() => open()}
        onPlanet={(p: Planet) => open(planetTarget(p))}
        onOverflow={() => open()}
      />
    </div>
  );
}
