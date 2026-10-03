import { getPlatform } from '@/platform';
import { WidgetSurface } from './WidgetSurface';
import { useWidgetShell } from './useWidgetShell';

/** The root of the "widget" window (route /widget). Desktop only. */
export function WidgetApp() {
  const { settings, planets, state, pendingCount, visible } = useWidgetShell();
  return (
    <div className="fixed inset-0">
      {/* Remounting on show/hide resets the hover state to the resting half sun. */}
      <WidgetSurface
        key={String(visible)}
        platform={getPlatform()}
        selection={planets}
        state={state}
        pendingCount={pendingCount}
        settings={settings}
      />
    </div>
  );
}
