import { useState } from "react";
import { backend, errorMessage, type Config } from "../api";
import { matches, toStored } from "../workspace";
import { AppBadge, Modal } from "./ui";
import { useWindowSelection, WindowPicker } from "./WindowPicker";

/**
 * Saves the current session as a named configuration. New configurations start with every open
 * window ticked; editing one keeps its windows unless "Replace with what's open now" is on.
 */
export function ConfigDialog({
  config,
  onClose,
  onSaved,
}: {
  config?: Config;
  onClose: () => void;
  onSaved: (c: Config) => void;
}) {
  const [name, setName] = useState(config?.name ?? "");
  const [description, setDescription] = useState(config?.description ?? "");
  const [recapture, setRecapture] = useState(!config);
  const pick = useWindowSelection((w) => !config || config.windows.some((s) => matches(s, w)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const windowCount = recapture ? pick.selected.size : (config?.windows.length ?? 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fields = { name: name.trim(), description };
    try {
      const saved = config
        ? await backend.updateConfig(config.id, recapture ? { ...fields, windows: pick.picked.map(toStored) } : fields)
        : await backend.createConfig({ ...fields, windows: pick.picked.map(toStored) });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      wide
      title={config ? `Edit "${config.name}"` : "New configuration"}
      subtitle={config ? undefined : "Saves the apps you have open right now, so you can bring them all back later."}
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label>
            Name
            <input autoFocus required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Coding setup" />
          </label>
          <label>
            Description
            <input maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        {config && (
          <label className="check-row">
            <input type="checkbox" checked={recapture} onChange={(e) => setRecapture(e.target.checked)} />
            Replace its windows with what's open now
          </label>
        )}

        {recapture ? (
          <>
            {pick.error && <div className="alert alert-error">{pick.error}</div>}
            <WindowPicker windows={pick.windows} selected={pick.selected} onToggle={pick.toggle} onSetAll={pick.setAll} />
          </>
        ) : (
          <ul className="win-list">
            {config?.windows.map((w) => (
              <li key={w.id} className="win-row">
                <AppBadge name={w.appName} />
                <div className="win-text">
                  <strong>{w.appName}</strong>
                  <span className="muted ellipsis">{w.title}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-foot form-foot">
          {recapture && (
            <button type="button" className="btn btn-ghost" onClick={() => void pick.reload()} disabled={saving}>
              ↻ Refresh list
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving || !name.trim() || windowCount === 0}>
            {saving ? "Saving…" : `Save with ${windowCount} window${windowCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
