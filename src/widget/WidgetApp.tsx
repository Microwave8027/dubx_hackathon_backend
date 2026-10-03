import { getPlatform } from '@/platform';
import { SUN_COLOR_VAR } from './planets';
import { useWidgetShell } from './useWidgetShell';

/**
 * The root of the "widget" window (route /widget). Desktop only. This is the resting half sun;
 * the hover expansion and planets come in the next PR.
 */
export function WidgetApp() {
  const { settings, state, pendingCount, planets } = useWidgetShell();
  const color = `rgb(var(${SUN_COLOR_VAR[state]}))`;
  const empty = planets.total === 0;

  return (
    <div
      className={`relative h-12 w-24 select-none overflow-hidden ${
        settings.opaque ? 'rounded-tl-[48px] bg-[#0b0f19]' : ''
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Open Command Center"
        onClick={() => void getPlatform().openCommandCenter()}
        className={`absolute bottom-0 left-0 h-12 w-24 cursor-pointer ${empty ? 'opacity-60' : ''}`}
      >
        <span
          aria-hidden
          className={`absolute left-0 top-0 block h-24 w-24 rounded-full ${
            state === 'needs-you' && !settings.reduceMotion ? 'animate-pulse-soft' : ''
          }`}
          style={{ background: color, boxShadow: `0 0 24px 6px ${color.replace(')', ' / 0.45)')}` }}
        />
      </button>
      {pendingCount > 0 && (
        <span className="pointer-events-none absolute right-1 top-1 min-w-5 rounded-full bg-bg px-1 text-center text-xs font-semibold text-ink">
          {pendingCount}
        </span>
      )}
    </div>
  );
}
