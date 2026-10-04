import { invoke } from "@tauri-apps/api/core";

export type BackendStatus = {
  state: "ready" | "dockerStopped" | "unreachable" | "outdated";
  backendUrl: string;
  local: boolean;
};

export type User = { id: string; email: string; name: string; picture: string };
export type Session = { backendUrl: string; user: User | null };

/** A window saved on a block (from the backend). */
export type StoredWindow = {
  id: string;
  pid: number;
  appName: string;
  title: string;
  exePath: string;
  aumid: string;
  args: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  monitor: string;
};

/** One calendar event plus its group of windows. */
export type Block = {
  id: string;
  googleEventId: string;
  name: string;
  description: string;
  color: string;
  start: string;
  stop: string;
  needsWindows: boolean;
  windowsSavedAt: string | null;
  windows: StoredWindow[];
};

/** A window that is open on this machine right now. */
export type OpenWindow = {
  id: number;
  pid: number;
  appName: string;
  title: string;
  exePath: string;
  aumid: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
  isFocused: boolean;
  monitor: string;
};

/** A named set of windows saved from the desktop, loadable at any time. */
export type Config = {
  id: string;
  name: string;
  description: string;
  windows: StoredWindow[];
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ConfigInput = { name: string; description: string; windows: Omit<StoredWindow, "id">[] };

export type Prompt = {
  kind: "upcoming" | "started";
  needsWindows: boolean;
  message: string;
  block: Block;
};

export type SyncResult = {
  added: number;
  replaced: number;
  removed: number;
  unchanged: number;
  blocks: Block[];
};

export type EventInput = {
  name: string;
  description: string;
  start: string;
  stop: string;
  color: string;
};

export type Operation =
  | ({ op: "create"; reason?: string } & EventInput)
  | ({ op: "update"; id: string; reason?: string } & EventInput)
  | { op: "delete"; id: string; reason?: string };

export type Proposal = { summary: string; warnings: string[]; operations: Operation[] };
export type BatchResult = { op: Operation["op"]; id: string | null; ok: boolean; error?: string };

export type LaunchSpec = Pick<
  StoredWindow,
  "exePath" | "aumid" | "args" | "x" | "y" | "width" | "height" | "isMinimized" | "isMaximized"
>;
export type LaunchResult = { exePath: string; ok: boolean; error: string | null };
export type CloseReport = { closed: number; skipped: number };
export type ArrangeTarget = { id: number; pid: number } & Omit<LaunchSpec, "exePath" | "aumid" | "args">;
export type ArrangeReport = { arranged: number; skipped: number };

export type AppError = { message: string; status: number | null };

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as AppError).message);
  return "Something went wrong";
}

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

type RequestOptions = { query?: Record<string, string>; body?: unknown };

/** Calls the backend through the Rust side, which attaches the bearer token. */
function api<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  return invoke<T>("api", {
    method,
    path,
    query: opts.query ?? null,
    body: opts.body ?? null,
  });
}

export const backend = {
  status: () => invoke<BackendStatus>("backend_status"),
  openDocker: () => invoke<void>("open_docker_desktop"),
  getSession: () => invoke<Session>("get_session"),
  setBackendUrl: (url: string) => invoke<Session>("set_backend_url", { url }),
  signIn: () => invoke<User>("sign_in"),
  cancelSignIn: () => invoke<void>("cancel_sign_in"),
  signOut: () => invoke<void>("sign_out"),

  listBlocks: (from: Date, to: Date) =>
    api<Block[]>("GET", "/blocks", { query: { from: from.toISOString(), to: to.toISOString() } }),
  sync: (from: Date, to: Date) =>
    api<SyncResult>("POST", "/blocks/sync", {
      body: { from: from.toISOString(), to: to.toISOString() },
    }),
  saveWindows: (blockId: string, windows: Omit<StoredWindow, "id">[]) =>
    api<Block>("PUT", `/blocks/${blockId}/windows`, { body: { windows } }),
  clearWindows: (blockId: string) => api<Block>("DELETE", `/blocks/${blockId}/windows`),
  removeWindow: (blockId: string, windowId: string) =>
    api<Block>("DELETE", `/blocks/${blockId}/windows/${windowId}`),

  listConfigs: () => api<Config[]>("GET", "/configs"),
  createConfig: (c: ConfigInput) => api<Config>("POST", "/configs", { body: c }),
  updateConfig: (id: string, c: Partial<ConfigInput>) => api<Config>("PUT", `/configs/${id}`, { body: c }),
  markConfigUsed: (id: string) => api<Config>("POST", `/configs/${id}/used`),
  deleteConfig: (id: string) => api<null>("DELETE", `/configs/${id}`),

  createEvent: (e: EventInput) => api("POST", "/schedule/events", { body: { ...e, timeZone } }),
  updateEvent: (id: string, e: EventInput) =>
    api("PUT", `/schedule/events/${encodeURIComponent(id)}`, { body: { ...e, timeZone } }),
  deleteEvent: (id: string) => api("DELETE", `/schedule/events/${encodeURIComponent(id)}`),
  assist: (prompt: string) =>
    api<Proposal>("POST", "/schedule/assist", { body: { prompt, timeZone } }),
  applyOperations: (operations: Operation[]) =>
    api<{ results: BatchResult[] }>("POST", "/schedule/batch", {
      body: { timeZone, operations: operations.map(({ reason: _reason, ...o }) => o) },
    }),
};

export const desktop = {
  snapshot: () => invoke<OpenWindow[]>("snapshot_windows"),
  close: (targets: { id: number; pid: number }[]) =>
    invoke<CloseReport>("close_windows", { targets }),
  launch: (apps: LaunchSpec[]) => invoke<LaunchResult[]>("launch_apps", { apps }),
  arrange: (targets: ArrangeTarget[]) => invoke<ArrangeReport>("arrange_windows", { targets }),
  showMain: () => invoke<void>("show_main"),
  streamStatus: () => invoke<boolean>("stream_status"),
};
