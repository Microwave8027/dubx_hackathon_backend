import { useCallback, useEffect, useState } from "react";
import { desktop, errorMessage, type OpenWindow } from "../api";
import { fileName } from "../format";
import { canLaunch } from "../workspace";
import { AppBadge, Spinner } from "./ui";

/** Snapshot of the open windows plus the user's selection. `initial` picks the pre-ticked ones. */
export function useWindowSelection(initial: (w: OpenWindow) => boolean) {
  const [windows, setWindows] = useState<OpenWindow[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const list = await desktop.snapshot();
      setWindows(list);
      setSelected(new Set(list.filter(initial).map((w) => w.id)));
    } catch (e) {
      setError(errorMessage(e));
      setWindows([]);
    }
    // `initial` is read on each (re)load only; callers pass an inline function, so it isn't a dependency.
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setAll = (on: boolean) => setSelected(new Set(on ? (windows ?? []).map((w) => w.id) : []));
  const picked = (windows ?? []).filter((w) => selected.has(w.id));

  return { windows, selected, picked, error, reload, toggle, setAll };
}

export function WindowPicker({
  windows,
  selected,
  onToggle,
  onSetAll,
}: {
  windows: OpenWindow[] | null;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onSetAll: (on: boolean) => void;
}) {
  if (!windows) {
    return (
      <div className="empty">
        <Spinner /> Looking at your open windows…
      </div>
    );
  }
  if (windows.length === 0) return <div className="empty">No open windows found.</div>;
  const all = selected.size === windows.length;
  return (
    <>
      <div className="pick-head">
        <span className="muted small">
          {selected.size} of {windows.length} selected
        </span>
        <button type="button" className="link small" onClick={() => onSetAll(!all)}>
          {all ? "Select none" : "Select all"}
        </button>
      </div>
      <ul className="pick-list">
        {windows.map((w) => (
          <li key={w.id}>
            <label className={`pick${selected.has(w.id) ? " pick-on" : ""}`}>
              <input type="checkbox" checked={selected.has(w.id)} onChange={() => onToggle(w.id)} />
              <AppBadge name={w.appName} />
              <div className="win-text">
                <strong>
                  {w.appName} {w.isFocused && <span className="pill">Focused</span>}
                </strong>
                <span className="ellipsis">{w.title}</span>
                {canLaunch(w) ? (
                  <span className="muted small ellipsis" title={w.aumid || w.exePath}>
                    {w.aumid ? "Store app" : fileName(w.exePath)} · PID {w.pid}
                  </span>
                ) : (
                  <span className="small warn">
                    {w.exePath ? "Built-in Windows app" : "Can't read the executable"} (PID {w.pid}); it won't reopen automatically.
                  </span>
                )}
              </div>
            </label>
          </li>
        ))}
      </ul>
    </>
  );
}
