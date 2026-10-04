import type { Response } from "express";

// Open Server-Sent Events streams, per user (a user may have the app open on several devices).
const streams = new Map<string, Set<Response>>();

// Comment lines keep proxies and idle-timeouts from closing a quiet stream.
const HEARTBEAT_MS = 10_000;

export function sendEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Turns `res` into an SSE stream for `userId`; it is unregistered when the client disconnects. */
export function subscribe(userId: string, res: Response) {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // disable nginx response buffering
  });
  res.flushHeaders();
  res.write("retry: 5000\n\n");

  let set = streams.get(userId);
  if (!set) streams.set(userId, (set = new Set()));
  set.add(res);

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  res.on("close", () => {
    clearInterval(heartbeat);
    set.delete(res);
    if (set.size === 0) streams.delete(userId);
  });
}

/** Pushes an event to every open stream of the user. Returns how many streams received it. */
export function notify(userId: string, event: string, data: unknown): number {
  const set = streams.get(userId);
  if (!set) return 0;
  for (const res of set) sendEvent(res, event, data);
  return set.size;
}
