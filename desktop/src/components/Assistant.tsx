import { useState } from "react";
import { backend, errorMessage, type Block, type Operation, type Proposal } from "../api";
import { fmtDay, fmtRange } from "../format";
import { Spinner, type Notify } from "./ui";

const EXAMPLES = [
  "Move tomorrow's gym session to 6pm",
  "Add 2 hours of deep work every weekday morning this week",
  "Clear my Friday afternoon",
  "Make every meeting this week 15 minutes shorter",
];

/** Gemini proposes calendar changes; the user reviews them before anything is applied. */
export function Assistant({
  blocks,
  notify,
  onApplied,
}: {
  blocks: Block[];
  notify: Notify;
  onApplied: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [thinking, setThinking] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byEventId = new Map(blocks.map((b) => [b.googleEventId, b]));

  async function ask(e?: React.FormEvent) {
    e?.preventDefault();
    if (!prompt.trim()) return;
    setThinking(true);
    setError(null);
    setProposal(null);
    try {
      const p = await backend.assist(prompt.trim());
      setProposal(p);
      setSelected(new Set(p.operations.map((_, i) => i)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setThinking(false);
    }
  }

  async function apply() {
    if (!proposal) return;
    const ops = proposal.operations.filter((_, i) => selected.has(i));
    if (!ops.length) return;
    setApplying(true);
    setError(null);
    try {
      const { results } = await backend.applyOperations(ops);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        notify(`${results.length - failed.length} change(s) applied, ${failed.length} failed: ${failed[0]?.error}`, "error");
      } else {
        notify(`Applied ${results.length} change(s) to your calendar`, "success");
      }
      setProposal(null);
      setPrompt("");
      onApplied();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setApplying(false);
    }
  }

  function toggle(i: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="assistant">
      <div className="page-head">
        <div>
          <h1>Assistant</h1>
          <p className="muted">Describe how you want your schedule to change. Gemini suggests the edits; nothing changes until you apply them.</p>
        </div>
      </div>

      <form className="card ask" onSubmit={ask}>
        <textarea
          rows={3}
          value={prompt}
          maxLength={4000}
          placeholder="e.g. Block out 9 to 11 every weekday for focused work and move my 1:1s to the afternoon"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void ask();
          }}
        />
        <div className="ask-foot">
          <div className="chips">
            {EXAMPLES.map((ex) => (
              <button type="button" key={ex} className="chip chip-btn" onClick={() => setPrompt(ex)}>
                {ex}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" disabled={thinking || !prompt.trim()}>
            {thinking ? (
              <>
                <Spinner /> Thinking…
              </>
            ) : (
              "Suggest changes"
            )}
          </button>
        </div>
      </form>

      {error && <div className="alert alert-error">{error}</div>}

      {proposal && (
        <section className="card proposal">
          <h2>Suggested changes</h2>
          {proposal.summary && <p>{proposal.summary}</p>}
          {proposal.warnings.map((w) => (
            <div key={w} className="alert alert-warn">
              {w}
            </div>
          ))}
          {proposal.operations.length === 0 ? (
            <p className="muted">No changes needed.</p>
          ) : (
            <ul className="ops">
              {proposal.operations.map((op, i) => (
                <li key={i}>
                  <label className={`op op-${op.op}${selected.has(i) ? "" : " op-off"}`}>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} />
                    <OperationView op={op} existing={op.op === "create" ? undefined : byEventId.get(op.id)} />
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="row-actions">
            <button className="btn" onClick={() => setProposal(null)} disabled={applying}>
              Discard
            </button>
            {proposal.operations.length > 0 && (
              <button className="btn btn-primary" onClick={apply} disabled={applying || selected.size === 0}>
                {applying ? "Applying…" : `Apply ${selected.size} change${selected.size === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function OperationView({ op, existing }: { op: Operation; existing?: Block }) {
  const label = op.op === "create" ? "Add" : op.op === "update" ? "Change" : "Remove";
  const when = (start: string, stop: string) => `${fmtDay(new Date(start))}, ${fmtRange(start, stop)}`;
  return (
    <div className="op-body">
      <span className={`op-tag op-tag-${op.op}`}>{label}</span>
      <div>
        {op.op === "delete" ? (
          <strong>{existing ? `${existing.name} · ${when(existing.start, existing.stop)}` : "An event outside the agenda"}</strong>
        ) : (
          <>
            <strong>
              <span className="color-dot" style={{ background: op.color }} /> {op.name} · {when(op.start, op.stop)}
            </strong>
            {op.op === "update" && existing && (
              <div className="muted small">
                was {existing.name} · {when(existing.start, existing.stop)}
              </div>
            )}
          </>
        )}
        {op.reason && <div className="muted small">{op.reason}</div>}
      </div>
    </div>
  );
}
