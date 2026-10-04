import { Schema, Types, model, type InferSchemaType } from "mongoose";
import { serializeWindow, windowSchema, type WindowDoc } from "./Window.ts";

// A named set of windows the user saved from their desktop ("my coding setup"). It isn't tied to
// a calendar event: it can be opened at any time or copied onto a block.
const configSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    windows: { type: [windowSchema], default: [] },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Names are unique per user (case-insensitive), so they can be told apart in the UI.
configSchema.index({ userId: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export type ConfigDoc = Omit<InferSchemaType<typeof configSchema>, "windows"> & {
  _id: Types.ObjectId;
  windows: WindowDoc[];
};
export const Config = model("Config", configSchema);

/** Public shape of a configuration. */
export function serializeConfig(c: ConfigDoc) {
  return {
    id: String(c._id),
    name: c.name,
    description: c.description ?? "",
    windows: c.windows.map(serializeWindow),
    lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
