import { z } from 'zod';
import { ApiError } from '@/transport/errors';
import { getTransport } from '@/transport';

/*
 * Token management for the Chrome extension. These calls are made by the signed-in app, which the
 * backend authenticates its own way; the extension itself only ever uses the bearer token.
 * The paths are the contract in docs/extension.md.
 */
const TokenSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type ExtensionToken = z.infer<typeof TokenSchema>;

const CreatedSchema = z.object({ id: z.string(), token: z.string().min(1), createdAt: z.string() });
export type CreatedToken = z.infer<typeof CreatedSchema>;

async function call<T>(schema: z.ZodType<T>, method: string, path: string): Promise<T> {
  const res = await getTransport().request(method, path);
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(`${method} ${path} failed (${res.status})`, res.status);
  }
  const parsed = schema.safeParse(res.json);
  if (!parsed.success) throw new ApiError(`Unexpected response from ${method} ${path}`, res.status);
  return parsed.data;
}

export const listExtensionTokens = () => call(z.array(TokenSchema), 'GET', '/api/extension/tokens');
/** The plain token is in this response and nowhere else, ever. */
export const createExtensionToken = () => call(CreatedSchema, 'POST', '/api/extension/tokens');
export const revokeExtensionToken = async (id: string): Promise<void> => {
  const res = await getTransport().request(
    'DELETE',
    `/api/extension/tokens/${encodeURIComponent(id)}`,
  );
  if (res.status !== 204 && (res.status < 200 || res.status >= 300)) {
    throw new ApiError(`DELETE token failed (${res.status})`, res.status);
  }
};
