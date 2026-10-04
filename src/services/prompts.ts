import { config } from "../config.ts";
import { Block, serializeBlock, type BlockDoc } from "../models/Block.ts";

export type PromptKind = "upcoming" | "started";

/** The prompt sent to the desktop app for a block that is coming up or starting. */
export function promptFor(block: BlockDoc, kind: PromptKind, now = Date.now()) {
  const needsWindows = block.windows.length === 0;
  const minutes = Math.max(1, Math.ceil((block.start.getTime() - now) / 60_000));
  const when =
    kind === "started" ? "is starting now" : `starts in ${minutes} minute${minutes === 1 ? "" : "s"}`;
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

// Prompts older than this are dropped (e.g. after the laptop was asleep) instead of replayed.
const MAX_CATCH_UP_MS = 10 * 60_000;

/**
 * Prompts that fell due in (since, now]. Computed from the stored blocks on every call, so no
 * state lives in the server: any instance can answer, and a missed poll is caught up next time.
 * - "upcoming": REMINDER_LEAD_MINUTES before a block starts. Also sent for a block that was
 *   created or synced inside its lead window, and (without `since`) for every block already in it.
 * - "started": when a block's start time passes.
 */
export async function duePrompts(userId: string, since: Date | undefined, now = Date.now()) {
  const lead = config.REMINDER_LEAD_MINUTES * 60_000;
  const from = Math.max(since?.getTime() ?? now, now - MAX_CATCH_UP_MS);
  const blocks = await Block.find({
    userId,
    start: { $gt: new Date(from), $lte: new Date(now + lead) },
  })
    .sort({ start: 1 })
    .lean<BlockDoc[]>();

  const prompts: ReturnType<typeof promptFor>[] = [];
  for (const b of blocks) {
    const start = b.start.getTime();
    const upcomingAt = start - lead;
    const inLeadWindow = upcomingAt <= now && start > now;
    const isNew = !since || (b.createdAt?.getTime() ?? 0) > from;
    if ((upcomingAt > from && upcomingAt <= now) || (inLeadWindow && isNew)) {
      prompts.push(promptFor(b, "upcoming", now));
    }
    if (start > from && start <= now) prompts.push(promptFor(b, "started", now));
  }
  return prompts;
}
