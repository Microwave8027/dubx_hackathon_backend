import type { Block, OpenWindow, StoredWindow } from "./api";

// UWP apps (Settings, Calculator, ...) all live in ApplicationFrameHost windows.
const FRAME_HOST = /[\\/]ApplicationFrameHost\.exe$/i;

/** Whether an open window is an instance of a saved one (same executable, else same app name). */
export function matches(stored: Pick<StoredWindow, "exePath" | "appName" | "title">, open: OpenWindow) {
  if (stored.exePath && open.exePath) {
    if (stored.exePath.toLowerCase() !== open.exePath.toLowerCase()) return false;
    // The frame host is shared by every UWP app, so only the title tells them apart.
    return !FRAME_HOST.test(stored.exePath) || stored.title === open.title;
  }
  return stored.appName.toLowerCase() === open.appName.toLowerCase();
}

/** Whether the app can be started automatically. */
export function canLaunch(w: Pick<StoredWindow, "exePath" | "aumid">) {
  return Boolean(w.aumid) || (Boolean(w.exePath) && !FRAME_HOST.test(w.exePath));
}

function appKey(w: Pick<StoredWindow, "exePath" | "appName" | "title">) {
  if (w.exePath && FRAME_HOST.test(w.exePath)) return `uwp:${w.title}`;
  return w.exePath ? `exe:${w.exePath.toLowerCase()}` : `app:${w.appName.toLowerCase()}`;
}

/** Saved windows collapsed to one entry per app (launching an app twice rarely helps). */
export function uniqueApps<T extends Pick<StoredWindow, "exePath" | "appName" | "title">>(windows: T[]): T[] {
  const seen = new Set<string>();
  return windows.filter((w) => {
    const key = appKey(w);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const startOf = (b: Block) => new Date(b.start).getTime();
export const stopOf = (b: Block) => new Date(b.stop).getTime();

/** The block in progress (the most recently started one if several overlap). */
export function currentBlock(blocks: Block[], now = Date.now()): Block | undefined {
  return blocks
    .filter((b) => startOf(b) <= now && now < stopOf(b))
    .sort((a, b) => startOf(b) - startOf(a))[0];
}

export function nextBlocks(blocks: Block[], limit: number, now = Date.now()): Block[] {
  return blocks
    .filter((b) => startOf(b) > now)
    .sort((a, b) => startOf(a) - startOf(b))
    .slice(0, limit);
}

export type TiedWindow = { stored: StoredWindow; open: OpenWindow[] };

/** Each saved window of the block with the open windows that belong to it. */
export function tieWindows(block: Block, running: OpenWindow[]): TiedWindow[] {
  return block.windows.map((stored) => ({
    stored,
    open: running.filter((w) => matches(stored, w)),
  }));
}

/** Anything that can be switched to: a calendar block or a saved configuration. */
export type Workspace = { id: string; name: string; windows: StoredWindow[] };

// The workspace the user last switched to, remembered so its apps can be closed on the next switch
// even after its block has scrolled out of the agenda.
const ACTIVE_KEY = "dubx.activeWorkspace";

export function getActiveWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Workspace & { blockId?: string };
    return { id: v.id ?? v.blockId ?? "", name: v.name, windows: v.windows ?? [] };
  } catch {
    return null;
  }
}

export function setActiveWorkspace(w: Workspace) {
  try {
    const value: Workspace = { id: w.id, name: w.name, windows: w.windows };
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: the next switch falls back to the previous block in the agenda.
  }
}

/**
 * The workspace a switch to `target` leaves: the active one (fresh from `blocks` when it's a
 * block), or, before the first switch, the latest block with windows that started before `targetStart`.
 */
export function workspaceToLeave(target: Workspace, blocks: Block[], targetStart?: number): Workspace | null {
  const active = getActiveWorkspace();
  if (active) {
    if (active.id === target.id) return null;
    return blocks.find((b) => b.id === active.id) ?? active;
  }
  if (targetStart === undefined) return null;
  return (
    blocks
      .filter((b) => b.id !== target.id && b.windows.length && startOf(b) < targetStart)
      .sort((a, b) => startOf(b) - startOf(a))[0] ?? null
  );
}

export type SwitchPlan = {
  target: Workspace;
  /** Workspace being left, whose apps get closed. */
  from: Workspace | null;
  /** Open windows that belong to the old workspace but not the new one. */
  close: OpenWindow[];
  /** Saved apps of the new workspace that aren't running yet. */
  launch: StoredWindow[];
  /** Open windows matched one-to-one with saved ones, to move back into place and raise. */
  arrange: { stored: StoredWindow; open: OpenWindow }[];
  /** Open windows that belong to neither workspace (closed only if the user opts in). */
  others: OpenWindow[];
  /** Saved apps that can't be started automatically (no executable path, or a UWP frame). */
  unlaunchable: StoredWindow[];
};

export function planSwitch(target: Workspace, from: Workspace | null, running: OpenWindow[]): SwitchPlan {
  const close = from
    ? running.filter(
        (w) =>
          from.windows.some((s) => matches(s, w)) && !target.windows.some((s) => matches(s, w)),
      )
    : [];

  // Pair each saved window with its own open window, preferring the same title
  // (e.g. two browser windows saved from the same app).
  const used = new Set<number>();
  const arrange: SwitchPlan["arrange"] = [];
  for (const stored of target.windows) {
    const candidates = running.filter((w) => !used.has(w.id) && matches(stored, w));
    const open = candidates.find((w) => w.title === stored.title) ?? candidates[0];
    if (open) {
      used.add(open.id);
      arrange.push({ stored, open });
    }
  }

  const launch: StoredWindow[] = [];
  const unlaunchable: StoredWindow[] = [];
  for (const stored of uniqueApps(target.windows)) {
    if (running.some((w) => matches(stored, w))) continue;
    if (canLaunch(stored)) launch.push(stored);
    else unlaunchable.push(stored);
  }

  const closing = new Set(close.map((w) => w.id));
  const others = running.filter(
    (w) => !closing.has(w.id) && !target.windows.some((s) => matches(s, w)),
  );
  return { target, from, close, launch, arrange, others, unlaunchable };
}

/** Saved windows as a request body (the backend assigns new ids). */
export function withoutIds(windows: StoredWindow[]): Omit<StoredWindow, "id">[] {
  return windows.map(({ id: _id, ...w }) => w);
}

/** The fields the backend stores for a captured window. */
export function toStored(w: OpenWindow): Omit<StoredWindow, "id"> {
  return {
    pid: w.pid,
    appName: w.appName || "Unknown app",
    title: w.title.slice(0, 1024),
    exePath: w.exePath,
    aumid: w.aumid,
    args: [],
    x: w.x,
    y: w.y,
    width: w.width,
    height: w.height,
    isMinimized: w.isMinimized,
    isMaximized: w.isMaximized,
    monitor: w.monitor,
  };
}
