import { z } from 'zod';
import { getTransport } from '@/transport';
import {
  BatchResponseSchema,
  ProposalSchema,
  type BatchResult,
  type Operation,
  type Proposal,
} from './types';

export class AssistantError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
  ) {
    super(message);
    this.name = 'AssistantError';
  }
  /** The user is not signed in (or has not connected Google Calendar). */
  get needsSignIn(): boolean {
    return this.status === 401;
  }
}

export const browserTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const serverMessage = (json: unknown): string | null => {
  const e = (json as { error?: unknown } | null)?.error;
  return typeof e === 'string' && e.length > 0 ? e : null;
};

async function call<T>(schema: z.ZodType<T>, path: string, body: unknown): Promise<T> {
  let res;
  try {
    res = await getTransport().request('POST', path, body);
  } catch {
    throw new AssistantError('Could not reach the server. Check your connection.', 0);
  }
  if (res.status < 200 || res.status >= 300) {
    const fallback =
      res.status === 401
        ? 'Sign in with Google to use the assistant.'
        : res.status === 502
          ? 'The AI service had a problem. Try again in a moment.'
          : `The server refused the request (${res.status}).`;
    throw new AssistantError(serverMessage(res.json) ?? fallback, res.status);
  }
  const parsed = schema.safeParse(res.json);
  if (!parsed.success)
    throw new AssistantError('The server sent an answer I could not read.', res.status);
  return parsed.data;
}

/** Asks the AI for edits. Read-only: nothing on the calendar changes. */
export function assist(prompt: string, timeZone: string = browserTimeZone()): Promise<Proposal> {
  return call(ProposalSchema, '/schedule/assist', { prompt, timeZone });
}

/** Applies the accepted operations; each one succeeds or fails on its own. */
export async function applyOperations(
  operations: Operation[],
  timeZone: string = browserTimeZone(),
): Promise<BatchResult[]> {
  // The backend only knows the documented fields, so the explanation is not sent back.
  const clean = operations.map((op) => {
    const copy: Record<string, unknown> = { ...op };
    delete copy.reason;
    // The server fills in a default for a missing description or colour but rejects null.
    for (const key of ['description', 'color']) if (copy[key] == null) delete copy[key];
    return copy;
  });
  const { results } = await call(BatchResponseSchema, '/schedule/batch', {
    timeZone,
    operations: clean,
  });
  return results;
}
