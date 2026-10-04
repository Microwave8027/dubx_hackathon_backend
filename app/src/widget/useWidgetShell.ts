import { useEffect, useMemo, useState } from 'react';
import { getPlatform } from '@/platform';
import { useLiveStore } from '@/state/store';
import { selectPlanets, sunState, type PlanetSelection } from './planets';
import { useWidgetSettings } from './settings';
import { shouldShowWidget } from './visibility';

/** Wake from sleep and monitor changes have no desktop event in Tauri 2, so re-check slowly. */
const REANCHOR_MS = 30_000;

/**
 * Owns the widget window's lifecycle: asks the OS whether the widget is supported, follows the
 * main window's visibility and the user's settings, and shows or hides the native window.
 */
export function useWidgetShell() {
  const settings = useWidgetSettings();
  const [supported, setSupported] = useState(false);
  const [mainVisible, setMainVisible] = useState(true);
  // Select the store's own (stable) slices and derive in useMemo; a derived object would re-render forever.
  const tasks = useLiveStore((s) => s.tasks);
  const layers = useLiveStore((s) => s.layers);
  const approvals = useLiveStore((s) => s.approvals);
  const data = useMemo(() => ({ tasks, layers, approvals }), [tasks, layers, approvals]);
  const planets: PlanetSelection = useMemo(() => selectPlanets(data), [data]);
  const state = useMemo(() => sunState(data), [data]);
  const pendingCount = useMemo(
    () => Object.values(approvals).filter((a) => a.status === 'pending').length,
    [approvals],
  );

  useEffect(() => {
    const platform = getPlatform();
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const keep = (p: Promise<() => void>) =>
      p.then((un) => (cancelled ? un() : cleanups.push(un))).catch(() => {});
    platform
      .widgetSupport()
      .then((s) => !cancelled && setSupported(s.supported))
      .catch(() => {});
    keep(platform.watchMainWindow(setMainVisible));
    keep(platform.watchWidgetSettings((raw) => useWidgetSettings.getState().applyRemote(raw)));
    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const visible = shouldShowWidget({
    mode: settings.mode,
    mainVisible,
    activeCount: planets.total,
    supported,
  });

  useEffect(() => {
    const platform = getPlatform();
    if (!visible) {
      void platform.hideWidget().catch(() => {});
      return;
    }
    void platform.showWidget(settings.bottomMargin).catch(() => {});
    const timer = setInterval(
      () => void platform.setWidgetExpanded(false, settings.bottomMargin).catch(() => {}),
      REANCHOR_MS,
    );
    return () => clearInterval(timer);
  }, [visible, settings.bottomMargin]);

  return { settings, planets, state, pendingCount, visible };
}
