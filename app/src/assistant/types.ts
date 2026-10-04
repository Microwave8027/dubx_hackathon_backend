import { z } from 'zod';

/*
 * POST /schedule/assist and POST /schedule/batch of the backend (docs/assistant.md). The server
 * proposes operations; nothing changes until the accepted ones are sent to /schedule/batch.
 */
const EventFields = {
  name: z.string(),
  // The AI may send null; /schedule/batch rejects null, so applyOperations leaves them out.
  description: z.string().nullish(),
  start: z.string(),
  stop: z.string(),
  color: z.string().nullish(),
};
// `reason` is not in the backend's documented shape but is harmless and shown if present.
const Reason = { reason: z.string().optional() };

export const OperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('create'), ...EventFields, ...Reason }),
  z.object({ op: z.literal('update'), id: z.string(), ...EventFields, ...Reason }),
  z.object({ op: z.literal('delete'), id: z.string(), ...Reason }),
]);
export type Operation = z.infer<typeof OperationSchema>;

export const ProposalSchema = z.object({
  summary: z.string().default(''),
  warnings: z.array(z.string()).default([]),
  operations: z.array(OperationSchema),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const BatchResultSchema = z.object({
  op: z.enum(['create', 'update', 'delete']),
  id: z.string().nullable(),
  ok: z.boolean(),
  error: z.string().optional(),
});
export type BatchResult = z.infer<typeof BatchResultSchema>;
export const BatchResponseSchema = z.object({ results: z.array(BatchResultSchema) });

export const MAX_PROMPT = 4000;
