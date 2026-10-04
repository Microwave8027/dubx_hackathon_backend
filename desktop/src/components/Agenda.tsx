import { useState } from "react";
import type { Block, StoredWindow } from "../api";
import { fmtDay, fmtRange, startOfDay } from "../format";
import { canLaunch, currentBlock, stopOf } from "../workspace";
import { AppBadge } from "./ui";

type Props = {
  blocks: Block[];
  days: number;
  onNew: () => void;
  onEdit: (b: Block) => void;
  onDelete: (b: Block) => void;
  onCapture: (b: Block) => void;
  onClearWindows: (b: Block) => void;
  onRemoveWindow: (b: Block, w: StoredWindow) => void;
};

export function Agenda(props: Props) {
  const { blocks, days, onNew } = props;
  const [showPast, setShowPast] = useState(false);
  const now = Date.now();
  const visible = showPast ? blocks : blocks.filter((b) => stopOf(b) > now);
  const hiddenPast = blocks.length - blocks.filter((b) => stopOf(b) > now).length;
  const current = currentBlock(blocks, now);

  const groups = new Map<number, Block[]>();
  for (const b of visible) {
    const day = startOfDay(new Date(b.start)).getTime();
    groups.set(day, [...(groups.get(day) ?? []), b]);
  }
  const withoutWindows = visible.filter((b) => b.windows.length === 0).length;

  return (
    <div className="agenda">
      <div className="page-head">
        <div>
          <h1>Agenda</h1>
          <p className="muted">
            Next {days} days from Google Calendar · {withoutWindows} block{withoutWindows === 1 ? "" : "s"} without windows
          </p>
        </div>
        <div className="row-actions">
          {hiddenPast > 0 && (
            <button className="btn btn-sm" onClick={() => setShowPast((s) => !s)}>
              {showPast ? "Hide earlier today" : `Show earlier today (${hiddenPast})`}
            </button>
          )}
          <button className="btn btn-primary" onClick={onNew}>
            + New event
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty card">
          <p>No timed events in the next {days} days.</p>
          <button className="btn btn-primary" onClick={onNew}>
            Create one
          </button>
        </div>
      ) : (
        [...groups.entries()].map(([day, items]) => (
          <section key={day} className="day">
            <h2 className="day-title">{fmtDay(new Date(day))}</h2>
            <ul className="block-list">
              {items.map((b) => (
                <BlockRow key={b.id} block={b} isNow={current?.id === b.id} {...props} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function BlockRow({ block: b, isNow, onEdit, onDelete, onCapture, onClearWindows, onRemoveWindow }: Props & { block: Block; isNow: boolean }) {
  const [open, setOpen] = useState(false);
  const shown = b.windows.slice(0, 4);
  return (
    <li className={`block${isNow ? " block-now" : ""}`} style={{ "--block-color": b.color } as React.CSSProperties}>
      <div className="block-main" onClick={() => b.windows.length && setOpen((o) => !o)}>
        <div className="block-time">{fmtRange(b.start, b.stop)}</div>
        <div className="block-info">
          <div className="block-name">
            {b.name}
            {isNow && <span className="pill pill-accent">Now</span>}
          </div>
          {b.description && <div className="muted ellipsis">{b.description}</div>}
          <div className="chips">
            {b.windows.length === 0 ? (
              <span className="pill pill-warn">No windows</span>
            ) : (
              <>
                <span className="pill pill-success">
                  {b.windows.length} window{b.windows.length === 1 ? "" : "s"}
                </span>
                {shown.map((w) => (
                  <span key={w.id} className="chip">
                    {w.appName}
                  </span>
                ))}
                {b.windows.length > shown.length && <span className="muted small">+{b.windows.length - shown.length}</span>}
              </>
            )}
          </div>
        </div>
        <div className="block-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-sm" onClick={() => onCapture(b)}>
            {b.windows.length ? "Re-capture" : "Capture windows"}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => onEdit(b)}>
            Edit
          </button>
          <button className="btn btn-sm btn-ghost danger" onClick={() => onDelete(b)}>
            Delete
          </button>
        </div>
      </div>
      {open && b.windows.length > 0 && (
        <div className="block-windows">
          <ul className="win-list">
            {b.windows.map((w) => (
              <li key={w.id} className="win-row">
                <AppBadge name={w.appName} />
                <div className="win-text">
                  <strong>{w.appName}</strong>
                  <span className="muted ellipsis">{canLaunch(w) ? (w.aumid ? `Store app · ${w.title}` : w.exePath) : "Can't be reopened automatically"}</span>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => onRemoveWindow(b, w)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button className="link danger" onClick={() => onClearWindows(b)}>
            Clear all windows
          </button>
        </div>
      )}
    </li>
  );
}
