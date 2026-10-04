import { useEffect, useState } from 'react';
import { getPlatform, type WidgetSupport } from '@/platform';
import { MAX_BOTTOM_MARGIN } from '@/widget/geometry';
import { useWidgetSettings } from '@/widget/settings';
import type { WidgetMode } from '@/widget/visibility';

const MODES: Array<{ value: WidgetMode; label: string }> = [
  { value: 'always', label: 'Always when the window is closed' },
  { value: 'running', label: 'Only when tasks are running' },
  { value: 'off', label: 'Off' },
];

/** Desktop-only widget preferences. They apply at once and are stored on this computer. */
export function WidgetSection() {
  const { mode, bottomMargin, reduceMotion, opaque, update } = useWidgetSettings();
  const [support, setSupport] = useState<WidgetSupport>({ supported: true });

  useEffect(() => {
    let cancelled = false;
    getPlatform()
      .widgetSupport()
      .then((s) => !cancelled && setSupport(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      {!support.supported && (
        <p role="note" className="rounded-lg border border-line bg-raised p-3 text-sm text-muted">
          {support.reason ?? 'The widget is not available on this system.'}
        </p>
      )}

      <fieldset disabled={!support.supported} className="space-y-4 disabled:opacity-60">
        <div role="radiogroup" aria-label="Widget mode" className="space-y-1">
          {MODES.map((m) => (
            <label
              key={m.value}
              className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-raised"
            >
              <input
                type="radio"
                name="widget-mode"
                value={m.value}
                checked={mode === m.value}
                onChange={() => update({ mode: m.value })}
                className="h-4 w-4 accent-accent"
              />
              <span className="text-sm">{m.label}</span>
            </label>
          ))}
        </div>

        <label className="flex min-h-touch flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">Bottom margin (px)</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_BOTTOM_MARGIN}
            value={bottomMargin}
            onChange={(e) => update({ bottomMargin: Number(e.target.value) })}
            className="min-h-touch w-24 rounded-lg border border-line bg-surface px-3"
          />
          <span className="text-muted">Lifts the widget above a dock or taskbar.</span>
        </label>

        <label className="flex min-h-touch cursor-pointer items-center gap-3 px-2 text-sm">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(e) => update({ reduceMotion: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Reduce motion in the widget (even if the system allows it)
        </label>

        <label className="flex min-h-touch cursor-pointer items-center gap-3 px-2 text-sm">
          <input
            type="checkbox"
            checked={opaque}
            onChange={(e) => update({ opaque: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Opaque widget (use if the transparent one looks wrong on your system)
        </label>
      </fieldset>
    </div>
  );
}
