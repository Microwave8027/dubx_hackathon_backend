import { Router, type Response } from "express";
import { z } from "zod";
import { config } from "../config.ts";
import { clientForUser } from "../google.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { Block, serializeBlock, type BlockDoc } from "../models/Block.ts";
import { MAX_WINDOWS, windowInput } from "../models/Window.ts";
import { syncBlocks } from "../services/blockSync.ts";
import { CalendarError, listCalendarEvents } from "../services/calendar.ts";
import { sendEvent, subscribe } from "../services/notifier.ts";
import { promptFor, scheduler } from "../services/scheduler.ts";

export const blocksRouter = Router();
blocksRouter.use(requireAuth);

const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_CONNECTED = "Google account not connected. Visit /auth/google to log in.";
const OBJECT_ID = /^[0-9a-f]{24}$/i;

function badRequest(res: Response, error: z.ZodError) {
  const issue = error.issues[0];
  res.status(400).json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message}` });
}

/** Loads one of the current user's blocks, or answers 404. */
async function findOwnBlock(userId: string, id: string, res: Response) {
  const block = OBJECT_ID.test(id) ? await Block.findOne({ _id: id, userId }) : null;
  if (!block) res.status(404).json({ error: "Block not found" });
  return block;
}

const windowsBody = z.object({
  windows: z.array(windowInput).max(MAX_WINDOWS),
});

const listQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // ?empty=true -> only blocks with no saved windows
  empty: z.enum(["true", "false"]).optional(),
});

const syncBody = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .default({});

// GET /blocks[?from=ISO&to=ISO&empty=true]
// Stored blocks overlapping the window, sorted by start. Default: everything not yet ended.
blocksRouter.get("/", async (req, res) => {
  const q = listQuery.safeParse(req.query);
  if (!q.success) return badRequest(res, q.error);
  const filter: Record<string, unknown> = {
    userId: req.userId,
    stop: { $gt: q.data.from ?? new Date() },
  };
  if (q.data.to) filter.start = { $lt: q.data.to };
  if (q.data.empty === "true") filter.windows = { $size: 0 };
  if (q.data.empty === "false") filter["windows.0"] = { $exists: true };
  const blocks = await Block.find(filter).sort({ start: 1 }).lean<BlockDoc[]>();
  res.json(blocks.map(serializeBlock));
});

// GET /blocks/upcoming[?within=minutes]
// Prompts for blocks starting in the next `within` minutes (default REMINDER_LEAD_MINUTES).
// Polling alternative to /blocks/stream.
blocksRouter.get("/upcoming", async (req, res) => {
  const q = z
    .object({ within: z.coerce.number().int().min(1).max(7 * 24 * 60).optional() })
    .safeParse(req.query);
  if (!q.success) return badRequest(res, q.error);
  const within = q.data.within ?? config.REMINDER_LEAD_MINUTES;
  res.json((await upcomingBlocks(req.userId!, within)).map((b) => promptFor(b, "upcoming")));
});

function upcomingBlocks(userId: string, withinMinutes: number) {
  const now = Date.now();
  return Block.find({
    userId,
    start: { $gt: new Date(now), $lte: new Date(now + withinMinutes * 60_000) },
  })
    .sort({ start: 1 })
    .lean<BlockDoc[]>();
}

// GET /blocks/stream  (Server-Sent Events)
// Events: `block_upcoming` (REMINDER_LEAD_MINUTES before start) and `block_started` (at start).
// Each carries { kind, needsWindows, message, block }. Blocks already inside their lead window
// are sent as `block_upcoming` as soon as the stream opens, so a late connect misses nothing.
blocksRouter.get("/stream", async (req, res) => {
  const userId = req.userId!;
  subscribe(userId, res);
  for (const b of await upcomingBlocks(userId, config.REMINDER_LEAD_MINUTES)) {
    if (!res.writableEnded) sendEvent(res, "block_upcoming", promptFor(b, "upcoming"));
  }
});

// Per-user guard so two overlapping syncs can't race on the same blocks.
const syncing = new Set<string>();

// POST /blocks/sync  { from?: ISO, to?: ISO }
// Pulls the live Google Calendar for the window (default: now -> SYNC_DAYS_AHEAD days) and
// makes the stored blocks match it: new events get empty window groups, changed events are
// deleted and recreated empty, events gone from the calendar are deleted. All-day events are skipped.
blocksRouter.post("/sync", async (req, res) => {
  const body = syncBody.safeParse(req.body ?? {});
  if (!body.success) return badRequest(res, body.error);
  const from = body.data.from ?? new Date();
  const to = body.data.to ?? new Date(from.getTime() + config.SYNC_DAYS_AHEAD * DAY_MS);
  if (to <= from) {
    res.status(400).json({ error: "to must be after from" });
    return;
  }

  const userId = req.userId!;
  if (syncing.has(userId)) {
    res.status(409).json({ error: "A sync is already in progress" });
    return;
  }
  const client = await clientForUser(userId);
  if (!client) {
    res.status(401).json({ error: NOT_CONNECTED });
    return;
  }

  syncing.add(userId);
  try {
    const events = await listCalendarEvents(client, { from, to });
    const result = await syncBlocks(userId, events, { from, to });
    res.json({ ...result, blocks: result.blocks.map(serializeBlock) });
  } catch (err) {
    if (err instanceof CalendarError) {
      res.status(err.status === 401 ? 401 : 502).json({ error: err.message });
      return;
    }
    throw err;
  } finally {
    syncing.delete(userId);
  }
});

// DELETE /blocks[?before=ISO]
// Deletes the user's blocks (and their windows). With `before`, only blocks that ended before it.
// Blocks still on the calendar come back (empty) on the next sync.
blocksRouter.delete("/", async (req, res) => {
  const q = z.object({ before: z.coerce.date().optional() }).safeParse(req.query);
  if (!q.success) return badRequest(res, q.error);
  const userId = req.userId!;
  if (q.data.before) {
    const filter = { userId, stop: { $lt: q.data.before } };
    const ids = (await Block.find(filter).select("_id").lean()).map((b) => b._id);
    await Block.deleteMany({ _id: { $in: ids } });
    scheduler.unschedule(ids);
  } else {
    await Block.deleteMany({ userId });
    scheduler.unscheduleUser(userId);
  }
  res.status(204).end();
});

// GET /blocks/:id
blocksRouter.get("/:id", async (req, res) => {
  const block = await findOwnBlock(req.userId!, req.params.id, res);
  if (block) res.json(serializeBlock(block));
});

// DELETE /blocks/:id -> removes the block and its windows (the calendar event is untouched)
blocksRouter.delete("/:id", async (req, res) => {
  const block = await findOwnBlock(req.userId!, req.params.id, res);
  if (!block) return;
  await block.deleteOne();
  scheduler.unschedule([block._id]);
  res.status(204).end();
});

// PUT /blocks/:id/windows  { windows: [...] }
// Replaces the block's whole window group (what the Tauri app sends after capturing with xcap).
blocksRouter.put("/:id/windows", async (req, res) => {
  const body = windowsBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  const block = await findOwnBlock(req.userId!, req.params.id, res);
  if (!block) return;
  block.set({ windows: body.data.windows, windowsSavedAt: new Date() });
  await block.save();
  res.json(serializeBlock(block));
});

// POST /blocks/:id/windows  { pid, appName, ... } -> appends one window to the group
blocksRouter.post("/:id/windows", async (req, res) => {
  const body = windowInput.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  const updated = OBJECT_ID.test(req.params.id)
    ? await Block.findOneAndUpdate(
        // Only matches while under the cap, so concurrent appends can't overflow it.
        {
          _id: req.params.id,
          userId: req.userId,
          [`windows.${MAX_WINDOWS - 1}`]: { $exists: false },
        },
        { $push: { windows: body.data }, $set: { windowsSavedAt: new Date() } },
        { returnDocument: "after" },
      )
    : null;
  if (updated) {
    res.status(201).json(serializeBlock(updated));
    return;
  }
  // Tell "full" apart from "missing".
  if (await findOwnBlock(req.userId!, req.params.id, res)) {
    res.status(409).json({ error: `A block can hold at most ${MAX_WINDOWS} windows` });
  }
});

// DELETE /blocks/:id/windows -> empties the window group
blocksRouter.delete("/:id/windows", async (req, res) => {
  const block = await findOwnBlock(req.userId!, req.params.id, res);
  if (!block) return;
  block.set({ windows: [], windowsSavedAt: null });
  await block.save();
  res.json(serializeBlock(block));
});

// DELETE /blocks/:id/windows/:windowId -> removes one window from the group
blocksRouter.delete("/:id/windows/:windowId", async (req, res) => {
  const block = await findOwnBlock(req.userId!, req.params.id, res);
  if (!block) return;
  const win = OBJECT_ID.test(req.params.windowId) ? block.windows.id(req.params.windowId) : null;
  if (!win) {
    res.status(404).json({ error: "Window not found" });
    return;
  }
  win.deleteOne();
  if (block.windows.length === 0) block.windowsSavedAt = null;
  await block.save();
  res.json(serializeBlock(block));
});
