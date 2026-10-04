import type { Types } from "mongoose";
import { config } from "../config.ts";
import { Block, serializeBlock, type BlockDoc } from "../models/Block.ts";
import { notify } from "./notifier.ts";

export type PromptKind = "upcoming" | "started";

type Job = {
  at: number; // epoch ms when the job fires
  kind: PromptKind;
  blockId: string;
  userId: string;
  start: number; // block start the job was queued for, to detect stale jobs
};

type Schedulable = { _id: Types.ObjectId; userId: Types.ObjectId; start: Date };

// setTimeout overflows above ~24.8 days; longer waits just re-arm when the timer fires.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** The prompt sent to the client for a block that is coming up or starting. */
export function promptFor(block: BlockDoc, kind: PromptKind) {
  const needsWindows = block.windows.length === 0;
  const minutes = Math.max(1, Math.ceil((block.start.getTime() - Date.now()) / 60_000));
  const when =
    kind === "started"
      ? "is starting now"
      : `starts in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const ask = needsWindows
    ? " No windows are saved for it yet. Save your current windows?"
    : kind === "started"
      ? " Opening its saved windows."
      : "";
  return {
    kind,
    needsWindows,
    message: `"${block.name}" ${when}.${ask}`,
    block: serializeBlock(block),
  };
}

/**
 * Keeps every upcoming block's timestamps in one queue sorted by time and arms a single timer
 * for the earliest. Each block gets two jobs: an "upcoming" prompt REMINDER_LEAD_MINUTES before
 * it starts, and a "started" prompt at its start time. The queue lives in memory and is rebuilt
 * from MongoDB on boot, so run one backend instance (or move this to a shared job queue).
 */
class BlockScheduler {
  private queue: Job[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  private get leadMs() {
    return config.REMINDER_LEAD_MINUTES * 60_000;
  }

  /** Loads every block that hasn't started yet. Call once at startup. */
  async load(): Promise<number> {
    const blocks = await Block.find({ start: { $gt: new Date() } })
      .select("_id userId start")
      .lean();
    this.queue = [];
    for (const b of blocks) this.enqueue(b);
    this.arm();
    return blocks.length;
  }

  /** Adds (or re-times) the jobs for these blocks. */
  schedule(blocks: Schedulable[]) {
    if (blocks.length === 0) return;
    const ids = new Set(blocks.map((b) => String(b._id)));
    this.queue = this.queue.filter((j) => !ids.has(j.blockId));
    for (const b of blocks) this.enqueue(b);
    this.arm();
  }

  unschedule(blockIds: Iterable<string | Types.ObjectId>) {
    const ids = new Set(Array.from(blockIds, String));
    if (ids.size === 0) return;
    this.queue = this.queue.filter((j) => !ids.has(j.blockId));
    this.arm();
  }

  unscheduleUser(userId: string) {
    this.queue = this.queue.filter((j) => j.userId !== userId);
    this.arm();
  }

  /** Number of pending jobs (for diagnostics). */
  get size() {
    return this.queue.length;
  }

  private enqueue(b: Schedulable) {
    const now = Date.now();
    const start = b.start.getTime();
    if (start <= now) return;
    const blockId = String(b._id);
    const userId = String(b.userId);
    // A block synced inside its lead window gets its "upcoming" prompt right away.
    this.insert({ at: Math.max(now, start - this.leadMs), kind: "upcoming", blockId, userId, start });
    this.insert({ at: start, kind: "started", blockId, userId, start });
  }

  /** Binary-search insert that keeps the queue sorted by `at` (FIFO for equal times). */
  private insert(job: Job) {
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.queue[mid]!.at <= job.at) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, job);
  }

  private arm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const next = this.queue[0];
    if (!next) return;
    const delay = Math.min(Math.max(0, next.at - Date.now()), MAX_TIMEOUT_MS);
    this.timer = setTimeout(() => void this.fire(), delay);
    this.timer.unref?.(); // never keep the process alive on its own
  }

  private async fire() {
    this.timer = null;
    const now = Date.now();
    let due = 0;
    while (due < this.queue.length && this.queue[due]!.at <= now) due++;
    const jobs = this.queue.splice(0, due);
    this.arm();
    const results = await Promise.allSettled(jobs.map((j) => this.run(j)));
    for (const r of results) {
      if (r.status === "rejected") console.error("Scheduler job failed:", r.reason);
    }
  }

  private async run(job: Job) {
    // Re-read the block so the prompt reflects windows saved since it was queued.
    const block = await Block.findById(job.blockId).lean<BlockDoc>();
    if (!block || block.start.getTime() !== job.start) return; // deleted or re-timed
    notify(job.userId, `block_${job.kind}`, promptFor(block, job.kind));
  }
}

export const scheduler = new BlockScheduler();
