import { useId, type CSSProperties } from 'react';
import type { TrayState } from '@/platform';
import './widget.css';
import { SUN_BOX, orbitSeconds, progressArc, ringRadius, startAngle } from './layout';
import {
  MAX_PLANETS,
  ORB,
  attentionCount,
  planetStatusText,
  planetStepText,
  type Planet,
  type PlanetSelection,
} from './planets';

export interface WidgetCanvasProps {
  selection: PlanetSelection;
  state: TrayState;
  pendingCount: number;
  expanded: boolean;
  reduceMotion: boolean;
  opaque: boolean;
  hoveredId: string | null;
  onHover(id: string | null): void;
  onSun(): void;
  onPlanet(planet: Planet): void;
  onOverflow(): void;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;

function Sun({
  pendingCount,
  onClick,
  onHover,
}: Pick<WidgetCanvasProps, 'pendingCount' | 'onHover'> & { onClick(): void }) {
  const gradientId = `wg-orb-${useId().replace(/:/g, '')}`;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label="Open Command Center"
      className="wg-sun"
      onClick={onClick}
      onPointerEnter={() => onHover(null)}
    >
      <svg width={SUN_BOX} height={SUN_BOX} viewBox={`0 0 ${SUN_BOX} ${SUN_BOX}`} aria-hidden>
        <defs>
          <radialGradient id={gradientId}>
            <stop offset="0%" stopColor={ORB.core} />
            <stop offset="45%" stopColor={ORB.mid} />
            <stop offset="76%" stopColor={ORB.edge} />
            <stop offset="88%" stopColor={ORB.edge} stopOpacity="0.55" />
            <stop offset="100%" stopColor={ORB.edge} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle
          className="wg-orb"
          cx={SUN_BOX / 2}
          cy={SUN_BOX / 2}
          r={SUN_BOX / 2}
          fill={`url(#${gradientId})`}
        />
      </svg>
      {pendingCount > 0 && (
        <span className="wg-badge" aria-label={`${pendingCount} waiting for approval`}>
          {pendingCount}
        </span>
      )}
    </button>
  );
}

function PlanetButton({
  planet,
  index,
  onHover,
  onClick,
}: {
  planet: Planet;
  index: number;
  onHover(id: string | null): void;
  onClick(): void;
}) {
  const r = planet.radius;
  const box = (r + 6) * 2;
  const arcRadius = r + 3;
  const { circumference, dashOffset } = progressArc(arcRadius, planet.progress);
  const label = `${planet.text}, ${planetStatusText(planet.status).toLowerCase()}, ${planetStepText(planet)}`;
  return (
    <div
      className="wg-orbit"
      style={
        {
          '--dur': `${orbitSeconds(index)}s`,
          '--phase': startAngle(index) / 360,
          '--ring': ringRadius(index),
          '--i': index,
        } as Vars
      }
    >
      <div className="wg-pos">
        <div
          className="wg-counter"
          style={{ '--dur': `${orbitSeconds(index)}s`, '--phase': startAngle(index) / 360 } as Vars}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={label}
            data-testid="planet"
            data-status={planet.status}
            className="wg-planet"
            style={{ color: ORB.edge, '--i': index } as Vars}
            onPointerEnter={() => onHover(planet.id)}
            onPointerLeave={() => onHover(null)}
            onClick={onClick}
          >
            <svg
              width={box}
              height={box}
              viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`}
              aria-hidden
            >
              <circle className="wg-planet-track" r={arcRadius} />
              <circle
                className="wg-planet-arc"
                r={arcRadius}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
              />
              <circle className="wg-planet-body" r={r} />
              {planet.status === 'waiting_approval' && (
                <circle className="wg-planet-wait" r={r + 5} />
              )}
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function OverflowPlanet({ count, onClick }: { count: number; onClick(): void }) {
  const index = MAX_PLANETS; // its own, outermost ring
  return (
    <div
      className="wg-orbit"
      style={
        {
          '--dur': `${orbitSeconds(index)}s`,
          '--phase': startAngle(index) / 360,
          '--ring': ringRadius(index),
          '--i': index,
        } as Vars
      }
    >
      <div className="wg-pos">
        <div
          className="wg-counter"
          style={{ '--dur': `${orbitSeconds(index)}s`, '--phase': startAngle(index) / 360 } as Vars}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${count} more running. Open Command Center`}
            data-testid="planet-overflow"
            className="wg-planet"
            style={{ '--i': index } as Vars}
            onClick={onClick}
          >
            <svg width={30} height={30} viewBox="-15 -15 30 30" aria-hidden>
              <circle className="wg-planet-more" r={13} />
              <text className="wg-planet-more-text" textAnchor="middle" dominantBaseline="central">
                +{count}
              </text>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The widget picture. Purely presentational: the window shell and hover choreography live outside,
 * so the same canvas serves the Tauri window and the /widget-preview page.
 */
export function WidgetCanvas(props: WidgetCanvasProps) {
  const { selection, state, expanded, reduceMotion, opaque, hoveredId } = props;
  const empty = selection.total === 0;
  const hovered = selection.planets.find((p) => p.id === hoveredId);
  const classes = [
    'wg-root',
    `wg-state-${state}`,
    expanded ? 'wg-expanded' : '',
    reduceMotion ? 'wg-static' : '',
    opaque ? 'wg-opaque' : '',
    empty ? 'wg-empty' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid="widget-canvas"
      data-state={state}
      data-expanded={expanded}
      data-motion={reduceMotion ? 'static' : 'animated'}
    >
      <div className="wg-stage">
        <div className="wg-label" data-visible={Boolean(hovered) || empty} role="status">
          {hovered ? (
            <>
              <strong>{hovered.text}</strong>
              <span>
                {planetStatusText(hovered.status)} · {planetStepText(hovered)}
              </span>
            </>
          ) : (
            empty && <strong>Nothing running</strong>
          )}
        </div>
        {/* The sun is first so planets always sit above it. */}
        <Sun
          pendingCount={attentionCount(props.pendingCount, selection)}
          onClick={props.onSun}
          onHover={props.onHover}
        />
        {selection.planets.map((p, i) => (
          <PlanetButton
            key={p.id}
            planet={p}
            index={i}
            onHover={props.onHover}
            onClick={() => props.onPlanet(p)}
          />
        ))}
        {selection.overflow > 0 && (
          <OverflowPlanet count={selection.overflow} onClick={props.onOverflow} />
        )}
      </div>
    </div>
  );
}
