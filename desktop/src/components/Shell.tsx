import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { backend, desktop, errorMessage, type Block, type Config, type Prompt, type StoredWindow, type User } from "../api";
import { addDays, fmtRange, startOfDay } from "../format";
import { currentBlock, setActiveWorkspace, startOf, workspaceToLeave, type Workspace } from "../workspace";
import { Agenda } from "./Agenda";
import { ApplyConfigDialog } from "./ApplyConfigDialog";
import { Assistant } from "./Assistant";
import { CaptureDialog } from "./CaptureDialog";
import { ConfigDialog } from "./ConfigDialog";
import { Configs } from "./Configs";
import { Dashboard } from "./Dashboard";
import { EventDialog } from "./EventDialog";
import { SwitchDialog } from "./SwitchDialog";
import { ConfirmDialog, Spinner, Toasts, useToasts } from "./ui";

const AGENDA_DAYS = 14;
const AUTO_SYNC_MS = 10 * 60_000;

type Tab = "dashboard" | "agenda" | "configs" | "assistant";
const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "agenda", label: "Agenda" },
  { id: "configs", label: "Configs" },
  { id: "assistant", label: "Assistant" },
];

// `from` is resolved when a switch dialog opens, so the plan doesn't shift while it's showing.
type Dialog =
  | { type: "capture"; block: Block; message?: string }
  | { type: "switch"; block: Block; from: Workspace | null; message?: string }
  | { type: "event"; block?: Block }
  | { type: "delete"; block: Block }
  | { type: "config-edit"; config?: Config }
  | { type: "config-load"; config: Config; from: Workspace | null }
  | { type: "config-apply"; config: Config }
  | { type: "config-delete"; config: Config };

function agendaRange() {
  const from = startOfDay();
  return { from, to: addDays(from, AGENDA_DAYS) };
}

export function Shell({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [configs, setConfigs] = useState<Config[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [live, setLive] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [queue, setQueue] = useState<Prompt[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toasts, notify] = useToasts();

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  /** Pulls Google Calendar into blocks (new events get empty window groups). */
  const sync = useCallback(
    async (announce = false) => {
      setSyncing(true);
      try {
        const { from, to } = agendaRange();
        const r = await backend.sync(from, to);
        setBlocks(r.blocks);
        setLastSync(new Date());
        if (announce) {
          const changed = r.added + r.replaced + r.removed;
          notify(
            changed
              ? `Synced: ${r.added} new, ${r.replaced} changed, ${r.removed} removed`
              : "Calendar is up to date",
            "success",
          );
        }
      } catch (e) {
        notify(errorMessage(e), "error");
      } finally {
        setSyncing(false);
        setLoaded(true);
      }
    },
    [notify],
  );

  const replaceBlock = useCallback((b: Block) => {
    setBlocks((bs) => bs.map((x) => (x.id === b.id ? b : x)));
  }, []);

  const loadConfigs = useCallback(async () => {
    try {
      setConfigs(await backend.listConfigs());
    } catch (e) {
      notify(errorMessage(e), "error");
      setConfigs((c) => c ?? []);
    }
  }, [notify]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const switchDialog = useCallback(
    (block: Block, message?: string): Dialog => ({
      type: "switch",
      block,
      message,
      from: workspaceToLeave(block, blocksRef.current, startOf(block)),
    }),
    [],
  );
  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), AUTO_SYNC_MS);
    return () => clearInterval(timer);
  }, [sync]);

  useEffect(() => {
    // The stream may have connected before this component subscribed.
    void desktop.streamStatus().then(setLive);
    const subs = [
      listen("tray-sync", () => void sync(true)),
      listen<boolean>("stream-status", (e) => setLive(e.payload)),
      listen<Prompt>("block-prompt", (e) => setQueue((q) => [...q, e.payload])),
    ];
    return () => subs.forEach((s) => void s.then((f) => f()));
  }, [sync]);

  // Show queued scheduler prompts one at a time.
  useEffect(() => {
    if (dialog || queue.length === 0) return;
    const [prompt, ...rest] = queue;
    setQueue(rest);
    const block = blocksRef.current.find((b) => b.id === prompt!.block.id) ?? prompt!.block;
    if (block.windows.length === 0) {
      setDialog({ type: "capture", block, message: prompt!.message });
    } else if (prompt!.kind === "started") {
      setDialog(switchDialog(block, prompt!.message));
    } else {
      notify(prompt!.message);
    }
  }, [dialog, queue, notify, switchDialog]);

  const closeDialog = useCallback(() => setDialog(null), []);

  async function signOut() {
    setMenuOpen(false);
    await backend.signOut().catch(() => {});
    onSignedOut();
  }

  const actions = {
    onCapture: (block: Block) => setDialog({ type: "capture", block }),
    onSwitch: (block: Block) => setDialog(switchDialog(block)),
    onNew: () => setDialog({ type: "event" }),
    onEdit: (block: Block) => setDialog({ type: "event", block }),
    onDelete: (block: Block) => setDialog({ type: "delete", block }),
    onClearWindows: async (block: Block) => {
      try {
        replaceBlock(await backend.clearWindows(block.id));
        notify(`Cleared the windows of "${block.name}"`);
      } catch (e) {
        notify(errorMessage(e), "error");
      }
    },
    onRemoveWindow: async (block: Block, w: StoredWindow) => {
      try {
        replaceBlock(await backend.removeWindow(block.id, w.id));
      } catch (e) {
        notify(errorMessage(e), "error");
      }
    },
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          Dubx
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab${tab === t.id ? " tab-active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <span className={`live${live ? " live-on" : ""}`} title={live ? "Receiving block reminders" : "Reminders offline, reconnecting"}>
            {live ? "Live" : "Offline"}
          </span>
          <button className="btn btn-sm" onClick={() => void sync(true)} disabled={syncing} title={lastSync ? `Last synced ${lastSync.toLocaleTimeString()}` : undefined}>
            {syncing ? <Spinner /> : "↻"} Sync
          </button>
          <div className="user-menu">
            <button className="avatar-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Account">
              {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : (user.name || user.email)[0]}
            </button>
            {menuOpen && (
              <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="menu-head">
                  <strong>{user.name || user.email}</strong>
                  <span className="muted">{user.email}</span>
                </div>
                <button className="menu-item" onClick={signOut}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="content">
        {!loaded ? (
          <div className="empty">
            <Spinner /> Syncing your calendar…
          </div>
        ) : tab === "dashboard" ? (
          <Dashboard blocks={blocks} onCapture={actions.onCapture} onSwitch={actions.onSwitch} />
        ) : tab === "agenda" ? (
          <Agenda blocks={blocks} days={AGENDA_DAYS} {...actions} />
        ) : tab === "configs" ? (
          <Configs
            configs={configs}
            onNew={() => setDialog({ type: "config-edit" })}
            onEdit={(config) => setDialog({ type: "config-edit", config })}
            onLoad={(config) => setDialog({ type: "config-load", config, from: workspaceToLeave(config, blocks) })}
            onApply={(config) => setDialog({ type: "config-apply", config })}
            onDelete={(config) => setDialog({ type: "config-delete", config })}
          />
        ) : (
          <Assistant blocks={blocks} notify={notify} onApplied={() => sync()} />
        )}
      </main>

      {dialog?.type === "capture" && (
        <CaptureDialog
          block={dialog.block}
          message={dialog.message}
          configs={configs ?? []}
          onClose={closeDialog}
          onSaved={(saved) => {
            replaceBlock(saved);
            // Captured apps are already open, so a block in progress is now the active workspace.
            if (currentBlock([saved])?.id === saved.id) setActiveWorkspace(saved);
            notify(`Saved ${saved.windows.length} window(s) to "${saved.name}"`, "success");
            closeDialog();
          }}
        />
      )}
      {dialog?.type === "switch" && (
        <SwitchDialog
          target={dialog.block}
          from={dialog.from}
          title={`Switch to "${dialog.block.name}"?`}
          subtitle={dialog.message ?? fmtRange(dialog.block.start, dialog.block.stop)}
          notify={notify}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "event" && (
        <EventDialog
          block={dialog.block}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            notify(dialog.block ? "Event updated" : "Event created", "success");
            void sync();
          }}
        />
      )}
      {dialog?.type === "delete" && (
        <ConfirmDialog
          title="Delete event?"
          message={`"${dialog.block.name}" will be removed from your Google Calendar, along with its saved windows.`}
          confirmLabel="Delete event"
          onClose={closeDialog}
          onConfirm={async () => {
            try {
              await backend.deleteEvent(dialog.block.googleEventId);
              notify("Event deleted", "success");
              closeDialog();
              await sync();
            } catch (e) {
              notify(errorMessage(e), "error");
            }
          }}
        />
      )}
      {dialog?.type === "config-edit" && (
        <ConfigDialog
          config={dialog.config}
          onClose={closeDialog}
          onSaved={(saved) => {
            notify(`Saved "${saved.name}" with ${saved.windows.length} window(s)`, "success");
            closeDialog();
            void loadConfigs();
          }}
        />
      )}
      {dialog?.type === "config-load" && (
        <SwitchDialog
          target={dialog.config}
          from={dialog.from}
          title={`Load "${dialog.config.name}"?`}
          actionLabel="Load"
          subtitle={dialog.config.description || undefined}
          notify={notify}
          onClose={closeDialog}
          onSwitched={() => void backend.markConfigUsed(dialog.config.id).then(loadConfigs, () => {})}
        />
      )}
      {dialog?.type === "config-apply" && (
        <ApplyConfigDialog
          config={dialog.config}
          blocks={blocks}
          onClose={closeDialog}
          onApplied={(block) => {
            replaceBlock(block);
            notify(`"${block.name}" will open "${dialog.config.name}"`, "success");
            closeDialog();
          }}
        />
      )}
      {dialog?.type === "config-delete" && (
        <ConfirmDialog
          title="Delete configuration?"
          message={`"${dialog.config.name}" will be deleted. Blocks that already use its windows keep them.`}
          confirmLabel="Delete"
          onClose={closeDialog}
          onConfirm={async () => {
            try {
              await backend.deleteConfig(dialog.config.id);
              notify("Configuration deleted", "success");
              closeDialog();
              await loadConfigs();
            } catch (e) {
              notify(errorMessage(e), "error");
            }
          }}
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}
