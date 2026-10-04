import { Schema, Types, type InferSchemaType } from "mongoose";
import { z } from "zod";

// Shared by blocks and saved configurations: the windows a group opens.
export const MAX_WINDOWS = 100;

// One desktop window captured by the Tauri app (via xcap) and replayed later.
export const windowSchema = new Schema({
  pid: { type: Number, required: true },
  appName: { type: String, required: true },
  title: { type: String, default: "" },
  // Executable to relaunch. PIDs don't survive restarts, so this is what actually reopens the app.
  exePath: { type: String, default: "" },
  // Windows AppUserModelID of packaged (Store/MSIX) apps, which are launched through it.
  aumid: { type: String, default: "" },
  args: { type: [String], default: [] },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  width: { type: Number, default: 0 },
  height: { type: Number, default: 0 },
  isMinimized: { type: Boolean, default: false },
  isMaximized: { type: Boolean, default: false },
  monitor: { type: String, default: "" },
});

export type WindowDoc = InferSchemaType<typeof windowSchema> & { _id: Types.ObjectId };

/** Public shape of a saved window. */
export function serializeWindow(w: WindowDoc) {
  return {
    id: String(w._id),
    pid: w.pid,
    appName: w.appName,
    title: w.title ?? "",
    exePath: w.exePath ?? "",
    aumid: w.aumid ?? "",
    args: w.args ?? [],
    x: w.x ?? 0,
    y: w.y ?? 0,
    width: w.width ?? 0,
    height: w.height ?? 0,
    isMinimized: w.isMinimized ?? false,
    isMaximized: w.isMaximized ?? false,
    monitor: w.monitor ?? "",
  };
}

// Request body for one window, matching what the Tauri app reads from xcap::Window (camelCase).
export const windowInput = z.object({
  pid: z.number().int().nonnegative(),
  appName: z.string().trim().min(1).max(256),
  title: z.string().max(1024).default(""),
  exePath: z.string().max(1024).default(""),
  aumid: z.string().max(256).default(""),
  args: z.array(z.string().max(1024)).max(50).default([]),
  x: z.number().int().default(0),
  y: z.number().int().default(0),
  width: z.number().int().nonnegative().default(0),
  height: z.number().int().nonnegative().default(0),
  isMinimized: z.boolean().default(false),
  isMaximized: z.boolean().default(false),
  monitor: z.string().max(256).default(""),
});
