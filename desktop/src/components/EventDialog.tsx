import { useState } from "react";
import { backend, errorMessage, type Block } from "../api";
import { toLocalInput } from "../format";
import { Modal } from "./ui";

const COLORS = ["#4F46E5", "#039BE5", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#64748B"];

function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  return { start, stop: new Date(start.getTime() + 60 * 60_000) };
}

/** Creates an event, or replaces an existing one's details. */
export function EventDialog({
  block,
  onClose,
  onSaved,
}: {
  block?: Block;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = block
    ? { start: new Date(block.start), stop: new Date(block.stop) }
    : defaultTimes();
  const [name, setName] = useState(block?.name ?? "");
  const [description, setDescription] = useState(block?.description ?? "");
  const [color, setColor] = useState(block?.color.toUpperCase() ?? COLORS[0]!);
  const [start, setStart] = useState(toLocalInput(initial.start));
  const [stop, setStop] = useState(toLocalInput(initial.stop));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const s = new Date(start);
    const t = new Date(stop);
    if (Number.isNaN(s.getTime()) || Number.isNaN(t.getTime())) return setError("Pick a start and end time.");
    if (t <= s) return setError("The end must be after the start.");
    setSaving(true);
    setError(null);
    const input = { name: name.trim(), description, color, start: s.toISOString(), stop: t.toISOString() };
    try {
      if (block) await backend.updateEvent(block.googleEventId, input);
      else await backend.createEvent(input);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal
      title={block ? "Edit event" : "New event"}
      subtitle={block && block.windows.length > 0 ? "Changing the name or time gives this block a fresh, empty window group." : undefined}
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input autoFocus required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="Deep work" />
        </label>
        <div className="form-row">
          <label>
            Starts
            <input type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Ends
            <input type="datetime-local" required value={stop} onChange={(e) => setStop(e.target.value)} />
          </label>
        </div>
        <label>
          Description
          <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="field">
          <span>Color</span>
          <div className="swatches">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`swatch${color === c ? " swatch-on" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={c}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="Custom color" />
          </div>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="modal-foot form-foot">
          <button type="button" className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : block ? "Save changes" : "Create event"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
