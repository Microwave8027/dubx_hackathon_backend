import type { Config } from "../api";
import { getActiveWorkspace, uniqueApps } from "../workspace";
import { Spinner } from "./ui";

const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function Configs({
  configs,
  onNew,
  onLoad,
  onApply,
  onEdit,
  onDelete,
}: {
  configs: Config[] | null;
  onNew: () => void;
  onLoad: (c: Config) => void;
  onApply: (c: Config) => void;
  onEdit: (c: Config) => void;
  onDelete: (c: Config) => void;
}) {
  const active = getActiveWorkspace();

  return (
    <div className="configs">
      <div className="page-head">
        <div>
          <h1>Configurations</h1>
          <p className="muted">Saved sets of apps. Load one any time, or use it for a calendar block.</p>
        </div>
        <button className="btn btn-primary" onClick={onNew}>
          + Save current windows
        </button>
      </div>

      {!configs ? (
        <div className="empty">
          <Spinner /> Loading configurations…
        </div>
      ) : configs.length === 0 ? (
        <div className="empty card">
          <p>No configurations yet. Open the apps you use together, then save them as one.</p>
          <button className="btn btn-primary" onClick={onNew}>
            Save current windows
          </button>
        </div>
      ) : (
        <ul className="config-grid">
          {configs.map((c) => {
            const apps = uniqueApps(c.windows);
            return (
              <li key={c.id} className="card config-card">
                <div className="config-head">
                  <h2>{c.name}</h2>
                  {active?.id === c.id && <span className="pill pill-accent">Active</span>}
                </div>
                {c.description && <p className="muted">{c.description}</p>}
                <div className="chips">
                  {apps.slice(0, 6).map((w) => (
                    <span key={w.id} className="chip">
                      {w.appName}
                    </span>
                  ))}
                  {apps.length > 6 && <span className="muted small">+{apps.length - 6}</span>}
                </div>
                <p className="muted small">
                  {c.windows.length} window{c.windows.length === 1 ? "" : "s"} ·{" "}
                  {c.lastUsedAt ? `loaded ${date.format(new Date(c.lastUsedAt))}` : `saved ${date.format(new Date(c.createdAt))}`}
                </p>
                <div className="row-actions config-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => onLoad(c)}>
                    Load
                  </button>
                  <button className="btn btn-sm" onClick={() => onApply(c)}>
                    Use for a block
                  </button>
                  <span className="spacer" />
                  <button className="btn btn-sm btn-ghost" onClick={() => onEdit(c)}>
                    Edit
                  </button>
                  <button className="btn btn-sm btn-ghost danger" onClick={() => onDelete(c)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
