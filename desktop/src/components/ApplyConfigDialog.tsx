import { useState } from "react";
import { backend, errorMessage, type Block, type Config } from "../api";
import { fmtDay, fmtRange } from "../format";
import { stopOf, withoutIds } from "../workspace";
import { Modal } from "./ui";

/** Copies a configuration's windows onto a calendar block, replacing the block's own. */
export function ApplyConfigDialog({
  config,
  blocks,
  onClose,
  onApplied,
}: {
  config: Config;
  blocks: Block[];
  onClose: () => void;
  onApplied: (b: Block) => void;
}) {
  const upcoming = blocks.filter((b) => stopOf(b) > Date.now());
  const [blockId, setBlockId] = useState(upcoming.find((b) => b.windows.length === 0)?.id ?? upcoming[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const target = upcoming.find((b) => b.id === blockId);

  async function apply() {
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      onApplied(await backend.saveWindows(target.id, withoutIds(config.windows)));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Use "${config.name}" for a block`}
      subtitle="The block will open these windows when it starts."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={saving || !target}>
            {saving ? "Saving…" : "Apply"}
          </button>
        </>
      }
    >
      {upcoming.length === 0 ? (
        <p className="muted">No upcoming blocks in the next two weeks.</p>
      ) : (
        <ul className="pick-list">
          {upcoming.map((b) => (
            <li key={b.id}>
              <label className={`pick${b.id === blockId ? " pick-on" : ""}`}>
                <input type="radio" name="block" checked={b.id === blockId} onChange={() => setBlockId(b.id)} />
                <span className="color-dot" style={{ background: b.color }} />
                <div className="win-text">
                  <strong>{b.name}</strong>
                  <span className="muted small">
                    {fmtDay(new Date(b.start))}, {fmtRange(b.start, b.stop)}
                    {b.windows.length > 0 && ` · replaces its ${b.windows.length} saved window${b.windows.length === 1 ? "" : "s"}`}
                  </span>
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="alert alert-error">{error}</div>}
    </Modal>
  );
}
