import { Schema, Types, model, type InferSchemaType } from "mongoose";
import { serializeWindow, windowSchema, type WindowDoc } from "./Window.ts";

// One Google Calendar event (a single instance, for recurring events) and its group of windows.
const blockSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    googleEventId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    color: { type: String, default: "#039BE5" },
    start: { type: Date, required: true },
    stop: { type: Date, required: true },
    // Hash of the fields that define the block (name/start/stop). When it changes in Google
    // Calendar, sync replaces the block with a fresh, empty one.
    fingerprint: { type: String, required: true },
    windows: { type: [windowSchema], default: [] },
    windowsSavedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

blockSchema.index({ userId: 1, googleEventId: 1 }, { unique: true });
blockSchema.index({ userId: 1, start: 1 });

// Plain-object shape (as returned by .lean()); hydrated documents satisfy it too.
export type BlockDoc = Omit<InferSchemaType<typeof blockSchema>, "windows"> & {
  _id: Types.ObjectId;
  windows: WindowDoc[];
};
export const Block = model("Block", blockSchema);

/** Public shape of a block. */
export function serializeBlock(b: BlockDoc) {
  return {
    id: String(b._id),
    googleEventId: b.googleEventId,
    name: b.name,
    description: b.description ?? "",
    color: b.color,
    start: b.start.toISOString(),
    stop: b.stop.toISOString(),
    needsWindows: b.windows.length === 0,
    windowsSavedAt: b.windowsSavedAt ? b.windowsSavedAt.toISOString() : null,
    windows: b.windows.map(serializeWindow),
  };
}
