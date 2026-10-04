import { useEffect, useState } from "react";
import { desktop, errorMessage } from "../api";
import { planSwitch, setActiveWorkspace, type SwitchPlan, type Workspace } from "../workspace";
import { AppBadge, Modal, Spinner, type Notify } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Makes the desktop match a workspace (a block or a config): closes the previous workspace's apps
 * (and, if asked, every other app), opens saved apps that aren't running, and moves the ones that
 * are back to their saved position and in front.
 */
export function SwitchDialog({
  target,
  from,
  title,
  subtitle,
  actionLabel = "Switch",
  notify,
  onClose,
  onSwitched,
}: {
  target: Workspace;
  /** Workspace being left (see workspaceToLeave). */
  from: Workspace | null;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  notify: Notify;
  onClose: () => void;
  onSwitched?: () => void;
}) {
  const [plan, setPlan] = useState<SwitchPlan | null>(null);
  const [closeOthers, setCloseOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    desktop
      .snapshot()
      .then((running) => setPlan(planSwitch(target, from, running)))
      .catch((e) => setError(errorMessage(e)));
  }, [target, from]);

  async function run() {
    if (!plan) return;
    setBusy(true);
    try {
      const toClose = closeOthers ? [...plan.close, ...plan.others] : plan.close;
      const closed = toClose.length ? await desktop.close(toClose.map((w) => ({ id: w.id, pid: w.pid }))) : null;
      const launched = plan.launch.length ? await desktop.launch(plan.launch) : [];
      const arranged = plan.arrange.length
        ? await desktop.arrange(
            plan.arrange.map(({ stored: s, open }) => ({
              id: open.id,
              pid: open.pid,
              x: s.x,
              y: s.y,
              width: s.width,
              height: s.height,
              isMinimized: s.isMinimized,
              isMaximized: s.isMaximized,
            })),
          )
        : null;
      setActiveWorkspace(target);

      const failed = launched.filter((r) => !r.ok);
      const done = [
        launched.length - failed.length && `opened ${plural(launched.length - failed.length, "app")}`,
        arranged?.arranged && `arranged ${plural(arranged.arranged, "window")}`,
        closed?.closed && `closed ${plural(closed.closed, "window")}`,
      ].filter(Boolean);
      notify(`"${target.name}": ${done.length ? done.join(" · ") : "already in place"}`, "success");
      if (failed.length) {
        notify(`Couldn't open ${plural(failed.length, "app")}: ${failed.map((f) => f.error).join("; ")}`, "error");
      }
      onSwitched?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const nothingToDo = plan && !plan.close.length && !plan.launch.length && !plan.arrange.length && !closeOthers;

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            Not now
          </button>
          <button className="btn btn-primary" onClick={run} disabled={!plan || busy}>
            {busy ? "Working…" : nothingToDo ? "Mark as active" : actionLabel}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      {!plan ? (
        !error && (
          <div className="empty">
            <Spinner /> Checking open windows…
          </div>
        )
      ) : (
        <div className="switch-plan">
          <PlanSection
            title={plan.from ? `Close from "${plan.from.name}"` : "Close"}
            empty={plan.from ? "None of its apps are open." : "No previous workspace to close."}
            items={plan.close.map((w) => ({ key: String(w.id), name: w.appName, detail: w.title }))}
            tone="danger"
          />
          <PlanSection
            title="Open"
            empty="Nothing new to open."
            items={plan.launch.map((w) => ({ key: w.id, name: w.appName, detail: w.aumid ? "Store app" : w.exePath }))}
            tone="success"
          />
          {plan.arrange.length > 0 && (
            <PlanSection
              title="Move back into place"
              items={plan.arrange.map(({ stored, open }) => ({ key: `${stored.id}:${open.id}`, name: open.appName, detail: open.title }))}
              tone="success"
            />
          )}
          {plan.unlaunchable.length > 0 && (
            <PlanSection
              title="Can't open automatically"
              items={plan.unlaunchable.map((w) => ({ key: w.id, name: w.appName, detail: w.title || "Not launchable" }))}
              tone="warn"
            />
          )}
          {plan.others.length > 0 && (
            <section className="plan plan-others">
              <label className="check-row">
                <input type="checkbox" checked={closeOthers} onChange={(e) => setCloseOthers(e.target.checked)} />
                Also close {plural(plan.others.length, "other open window")}
              </label>
              {closeOthers && (
                <ul className="win-list">
                  {plan.others.map((w) => (
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
            </section>
          )}
          {(plan.close.length > 0 || closeOthers) && (
            <p className="muted small">Apps are asked to close normally, so they can still prompt you to save your work.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

function PlanSection({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: { key: string; name: string; detail: string }[];
  empty?: string;
  tone?: "danger" | "success" | "warn";
}) {
  return (
    <section className={`plan${tone ? ` plan-${tone}` : ""}`}>
      <h3>
        {title} <span className="muted">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="win-list">
          {items.map((i) => (
            <li key={i.key} className="win-row">
              <AppBadge name={i.name} />
              <div className="win-text">
                <strong>{i.name}</strong>
                <span className="muted ellipsis">{i.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
