import { useState } from "react";
import { backend, errorMessage, type Block, type Config } from "../api";
import { fmtDay, fmtRange } from "../format";
import { matches, toStored, withoutIds } from "../workspace";
import { Modal } from "./ui";
import { useWindowSelection, WindowPicker } from "./WindowPicker";

/** Snapshot of open windows; the user picks which ones belong to the block (or uses a saved config). */
export function CaptureDialog({
  block,
  message,
  configs,
  onClose,
  onSaved,
}: {
  block: Block;
  message?: string;
  configs: Config[];
  onClose: () => void;
  onSaved: (b: Block) => void;
}) {
  // Re-capturing: pre-select what's already saved for this block.
  const pick = useWindowSelection((w) => block.windows.some((s) => matches(s, w)));
  const [configId, setConfigId] = useState(configs[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(windows: Parameters<typeof backend.saveWindows>[1]) {
    setSaving(true);
    setError(null);
    try {
      onSaved(await backend.saveWindows(block.id, windows));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  const config = configs.find((c) => c.id === configId);

  return (
    <Modal
      wide
      title={`Choose windows for "${block.name}"`}
      subtitle={message ?? `${fmtDay(new Date(block.start))}, ${fmtRange(block.start, block.stop)}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => void pick.reload()} disabled={saving}>
            ↻ Refresh list
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose} disabled={saving}>
            Not now
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void save(pick.picked.map(toStored))}
            disabled={saving || pick.selected.size === 0}
          >
            {saving ? "Saving…" : `Save ${pick.selected.size} window${pick.selected.size === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      {configs.length > 0 && (
        <div className="use-config">
          <span>Use a saved configuration:</span>
          <select value={configId} onChange={(e) => setConfigId(e.target.value)}>
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.windows.length} window{c.windows.length === 1 ? "" : "s"})
              </option>
            ))}
          </select>
          <button className="btn btn-sm" disabled={saving || !config} onClick={() => config && void save(withoutIds(config.windows))}>
            Use it
          </button>
        </div>
      )}
      <p className="muted">
        {configs.length > 0 ? "Or tick the apps open right now that belong to this block. " : "These are the apps open right now. Tick the ones that belong to this block. "}
        They'll be reopened when it starts, and closed when you switch to another block.
      </p>
      {(error || pick.error) && <div className="alert alert-error">{error ?? pick.error}</div>}
      <WindowPicker windows={pick.windows} selected={pick.selected} onToggle={pick.toggle} onSetAll={pick.setAll} />
    </Modal>
  );
}
