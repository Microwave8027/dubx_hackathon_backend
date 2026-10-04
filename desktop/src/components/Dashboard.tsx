import { useEffect, useState } from "react";
import { desktop, type Block, type OpenWindow } from "../api";
import { fmtCountdown, fmtDay, fmtRange } from "../format";
import { currentBlock, getActiveWorkspace, nextBlocks, tieWindows, uniqueApps } from "../workspace";
import { AppBadge } from "./ui";

const REFRESH_MS = 5000;

export function Dashboard({
  blocks,
  onCapture,
  onSwitch,
}: {
  blocks: Block[];
  onCapture: (b: Block) => void;
  onSwitch: (b: Block) => void;
}) {
  const [running, setRunning] = useState<OpenWindow[] | null>(null);
  const [now, setNow] = useState(Date.now());

  // Live view of what's open on this machine.
  useEffect(() => {
    let alive = true;
    const load = () =>
      desktop
        .snapshot()
        .then((w) => alive && setRunning(w))
        .catch(() => alive && setRunning([]));
    void load();
    const timer = setInterval(() => {
      void load();
      setNow(Date.now());
    }, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const current = currentBlock(blocks, now);
  const upcoming = nextBlocks(blocks, 4, now);
  const active = getActiveWorkspace();
  const tied = current && running ? tieWindows(current, running) : [];
  const tiedIds = new Set(tied.flatMap((t) => t.open.map((w) => w.id)));
  const others = (running ?? []).filter((w) => !tiedIds.has(w.id));
  const openCount = tied.filter((t) => t.open.length > 0).length;

  return (
    <div className="dashboard">
      <section className="card now-card">
        <div className="card-label">Now</div>
        {current ? (
          <>
            <div className="now-head">
              <span className="color-dot" style={{ background: current.color }} />
              <div>
                <h2>{current.name}</h2>
                <p className="muted">
                  {fmtRange(current.start, current.stop)} · ends {fmtCountdown(current.stop, now)}
                  {active?.id === current.id && <span className="pill pill-accent">Active workspace</span>}
                </p>
              </div>
            </div>

            {current.windows.length === 0 ? (
              <div className="callout">
                <p>No windows are saved for this block yet.</p>
                <button className="btn btn-primary" onClick={() => onCapture(current)}>
                  Choose windows
                </button>
              </div>
            ) : (
              <>
                <h3 className="section-title">
                  Tied windows <span className="muted">{openCount}/{tied.length} open</span>
                </h3>
                <ul className="win-list">
                  {tied.map(({ stored, open }) => (
                    <li key={stored.id} className="win-row">
                      <AppBadge name={stored.appName} muted={open.length === 0} />
                      <div className="win-text">
                        <strong>{stored.appName}</strong>
                        <span className="muted ellipsis">{open[0]?.title ?? stored.title}</span>
                      </div>
                      {open.length > 0 ? (
                        <span className="pill pill-success">Open{open.length > 1 ? ` ×${open.length}` : ""}</span>
                      ) : (
                        <span className="pill">Not running</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="row-actions">
                  <button className="btn btn-primary" onClick={() => onSwitch(current)}>
                    Switch to this workspace
                  </button>
                  <button className="btn" onClick={() => onCapture(current)}>
                    Update windows
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="free">
            <h2>Free time</h2>
            <p className="muted">
              Nothing on your calendar right now.
              {active && ` Last workspace: ${active.name}.`}
            </p>
          </div>
        )}
      </section>

      <section className="card next-card">
        <div className="card-label">Up next</div>
        {upcoming.length === 0 ? (
          <p className="muted">Nothing else scheduled in the next two weeks.</p>
        ) : (
          <ul className="next-list">
            {upcoming.map((b) => {
              const apps = uniqueApps(b.windows);
              return (
                <li key={b.id} className="next-item">
                  <div className="next-time">
                    <strong>{fmtCountdown(b.start, now)}</strong>
                    <span className="muted">
                      {fmtDay(new Date(b.start))}, {fmtRange(b.start, b.stop)}
                    </span>
                  </div>
                  <div className="next-body">
                    <div className="next-name">
                      <span className="color-dot" style={{ background: b.color }} />
                      {b.name}
                    </div>
                    {apps.length > 0 ? (
                      <div className="chips">
                        <span className="muted small">Will open:</span>
                        {apps.map((w) => (
                          <span key={w.id} className="chip">
                            {w.appName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <button className="link warn" onClick={() => onCapture(b)}>
                        No windows saved. Choose windows
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card others-card">
        <div className="card-label">
          Other open windows <span className="muted">{running ? others.length : "…"}</span>
        </div>
        {running && others.length === 0 ? (
          <p className="muted">Everything that's open belongs to the current block.</p>
        ) : (
          <ul className="others-grid">
            {others.map((w) => (
              <li key={w.id} className="other" title={w.exePath || w.appName}>
                <AppBadge name={w.appName} />
                <div className="win-text">
                  <strong className="ellipsis">{w.appName}</strong>
                  <span className="muted ellipsis">{w.title}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
