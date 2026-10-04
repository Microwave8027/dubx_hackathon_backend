import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { Block, type BlockDoc } from "../models/Block.ts";
import type { CalendarEvent } from "./calendar.ts";
import { scheduler } from "./scheduler.ts";

/** Identifies a block's defining fields; a change means the block is treated as a new one. */
export function fingerprint(e: { name: string; start: Date; stop: Date }): string {
  return createHash("sha256")
    .update(JSON.stringify([e.name, e.start.toISOString(), e.stop.toISOString()]))
    .digest("hex");
}

export type SyncResult = {
  added: number;
  replaced: number;
  removed: number;
  unchanged: number;
  blocks: BlockDoc[];
};

/**
 * Makes the user's stored blocks in [from, to) match `events` (the live calendar):
 * - new events get a block with an empty window group,
 * - events whose name/start/stop changed have their block deleted and recreated empty,
 * - blocks whose event no longer exists are deleted.
 * Description/color edits are applied in place and keep the saved windows.
 * Blocks outside the range are left alone.
 */
export async function syncBlocks(
  userId: string,
  events: CalendarEvent[],
  range: { from: Date; to: Date },
): Promise<SyncResult> {
  const cloud = new Map<string, CalendarEvent>();
  for (const e of events) if (!e.allDay) cloud.set(e.googleEventId, e);

  // Also load blocks for events that just moved into the range, so they're replaced, not duplicated.
  const stored = await Block.find({
    userId,
    $or: [
      { stop: { $gt: range.from }, start: { $lt: range.to } },
      { googleEventId: { $in: [...cloud.keys()] } },
    ],
  }).lean<BlockDoc[]>();
  const storedByEvent = new Map(stored.map((b) => [b.googleEventId, b]));

  const toDelete: Types.ObjectId[] = [];
  const toInsert: Omit<BlockDoc, "_id" | "windows" | "createdAt" | "updatedAt">[] = [];
  const toUpdate: { id: Types.ObjectId; description: string; color: string }[] = [];
  const owner = new Types.ObjectId(userId);
  let added = 0;
  let replaced = 0;
  let unchanged = 0;

  for (const e of cloud.values()) {
    const fp = fingerprint(e);
    const existing = storedByEvent.get(e.googleEventId);
    if (existing?.fingerprint === fp) {
      unchanged++;
      if (existing.description !== e.description || existing.color !== e.color) {
        toUpdate.push({ id: existing._id, description: e.description, color: e.color });
      }
      continue;
    }
    if (existing) {
      toDelete.push(existing._id);
      replaced++;
    } else {
      added++;
    }
    toInsert.push({
      userId: owner,
      googleEventId: e.googleEventId,
      name: e.name,
      description: e.description,
      color: e.color,
      start: e.start,
      stop: e.stop,
      fingerprint: fp,
      windowsSavedAt: null, // windows default to an empty group
    });
  }

  let removed = 0;
  for (const b of stored) {
    if (!cloud.has(b.googleEventId)) {
      toDelete.push(b._id);
      removed++;
    }
  }

  // Delete before inserting: a replaced block reuses its googleEventId (unique per user).
  if (toDelete.length) await Block.deleteMany({ _id: { $in: toDelete } });
  if (toUpdate.length) {
    await Block.bulkWrite(
      toUpdate.map((u) => ({
        updateOne: {
          filter: { _id: u.id },
          update: { $set: { description: u.description, color: u.color } },
        },
      })),
    );
  }
  const inserted = toInsert.length ? await Block.insertMany(toInsert) : [];

  scheduler.unschedule(toDelete);
  scheduler.schedule(inserted);

  const blocks = await Block.find({
    userId,
    stop: { $gt: range.from },
    start: { $lt: range.to },
  })
    .sort({ start: 1 })
    .lean<BlockDoc[]>();

  return { added, replaced, removed, unchanged, blocks };
}
