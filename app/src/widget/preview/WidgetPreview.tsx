import { useMemo, useRef, useState } from 'react';
import { useDocumentTitle } from '@/app/useDocumentTitle';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { WidgetTarget } from '@/platform';
import { WIDGET_SIZES } from '../geometry';
import { selectPlanets, sunState } from '../planets';
import { WidgetCanvas } from '../WidgetCanvas';
import { WidgetSurface, type WidgetControls } from '../WidgetSurface';
import { INITIAL_ITEMS, makeItem, toWidgetData, type PreviewItem } from './mockData';
import { createPreviewPlatform } from './previewPlatform';

const noop = () => {};
const MAX_TASKS = 20;

function Button({ onClick, children }: { onClick(): void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-touch rounded-lg bg-raised px-4 text-sm font-medium hover:bg-line"
    >
      {children}
    </button>
  );
}

/** A fake desktop so transparency is visible. */
const DESKTOP = 'bg-gradient-to-br from-indigo-900 via-slate-700 to-amber-700';

/**
 * Design and test page for the desktop widget (web build only). Runs the real canvas, hover
 * choreography and selectors against mock data and a fake platform adapter.
 */
export function WidgetPreview() {
  useDocumentTitle();
  const [items, setItems] = useState<PreviewItem[]>(INITIAL_ITEMS);
  const [nextId, setNextId] = useState(INITIAL_ITEMS.length + 1);
  const [native, setNative] = useState<'collapsed' | 'expanded'>('collapsed');
  const [calls, setCalls] = useState<string[]>([]);
  const controls = useRef<WidgetControls | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [opaque, setOpaque] = useState(false);
  const osReduce = useMediaQuery('(prefers-reduced-motion: reduce)');

  const platform = useMemo(
    () =>
      createPreviewPlatform({
        onNativeExpanded: (e) => setNative(e ? 'expanded' : 'collapsed'),
        onOpen: (target: WidgetTarget | undefined) =>
          setCalls((c) => [...c, `openCommandCenter ${JSON.stringify(target ?? {})}`]),
      }),
    [],
  );

  const data = useMemo(() => toWidgetData(items), [items]);
  const selection = useMemo(() => selectPlanets(data), [data]);
  const state = useMemo(() => sunState(data), [data]);
  const pendingCount = Object.values(data.approvals).length;
  const settings = { reduceMotion, opaque, bottomMargin: 0 };

  const size = WIDGET_SIZES[native];
  const refs = [
    { key: 'collapsed', title: 'Resting (96×48)', expanded: false, size: WIDGET_SIZES.collapsed },
    { key: 'expanded', title: 'Expanded (320×320)', expanded: true, size: WIDGET_SIZES.expanded },
  ] as const;

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4 mid:p-8" aria-labelledby="wp-title">
      <header className="space-y-2">
        <h1 id="wp-title" className="text-xl font-semibold">
          Widget preview
        </h1>
        <p className="text-sm text-muted">
          The desktop widget with mock data. Hover the live widget, or use the buttons. Desktop only
          in the real app.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Preview controls">
        <Button onClick={() => controls.current?.expandNow()}>Expand widget</Button>
        <Button onClick={() => controls.current?.collapseNow()}>Collapse widget</Button>
        <Button
          onClick={() => {
            if (items.length >= MAX_TASKS) return;
            setItems((i) => [...i, makeItem(nextId)]);
            setNextId((n) => n + 1);
          }}
        >
          Add task
        </Button>
        <Button onClick={() => setItems((i) => i.slice(0, -1))}>Remove task</Button>
        <Button onClick={() => setItems([])}>Clear tasks</Button>
        <label className="flex min-h-touch items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(e) => setReduceMotion(e.target.checked)}
          />
          Reduce motion
        </label>
        <label className="flex min-h-touch items-center gap-2 text-sm">
          <input type="checkbox" checked={opaque} onChange={(e) => setOpaque(e.target.checked)} />
          Opaque
        </label>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {items.length} task{items.length === 1 ? '' : 's'}
      </p>

      <section aria-labelledby="wp-live" className="space-y-2">
        <h2 id="wp-live" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Live
        </h2>
        <div
          className={`relative h-[360px] w-full max-w-[480px] overflow-hidden rounded-card ${DESKTOP}`}
        >
          <div
            data-testid="widget-window"
            data-native={native}
            className="absolute bottom-0 right-0"
            style={{ width: size.width, height: size.height }}
          >
            <WidgetSurface
              platform={platform}
              selection={selection}
              state={state}
              pendingCount={pendingCount}
              settings={settings}
              controlsRef={controls}
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="wp-sizes" className="space-y-2">
        <h2 id="wp-sizes" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Both sizes
        </h2>
        <div className="flex flex-wrap items-end gap-6">
          {refs.map((r) => (
            <figure key={r.key} className="space-y-2">
              <div
                data-testid={`widget-ref-${r.key}`}
                aria-hidden
                {...({ inert: '' } as object)}
                className={`relative overflow-hidden rounded-card ${DESKTOP}`}
                style={{ width: r.size.width, height: r.size.height }}
              >
                <WidgetCanvas
                  selection={selection}
                  state={state}
                  pendingCount={pendingCount}
                  expanded={r.expanded}
                  reduceMotion={reduceMotion || osReduce}
                  opaque={opaque}
                  hoveredId={null}
                  onHover={noop}
                  onSun={noop}
                  onPlanet={noop}
                  onOverflow={noop}
                />
              </div>
              <figcaption className="text-xs text-muted">{r.title}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section aria-labelledby="wp-calls" className="space-y-2">
        <h2 id="wp-calls" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Platform calls
        </h2>
        <ul data-testid="calls" className="min-h-6 space-y-1 font-mono text-xs text-muted">
          {calls.length === 0 ? <li>None yet</li> : calls.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </section>
    </main>
  );
}
