// Tab-sync API for the Chrome extension, as the dev mock's in-memory version of the contract in
// docs/extension.md. The real backend must follow the same rules: hashed per-user tokens, strict
// CORS for the extension origin only, validated bodies, capped sizes, idempotent snapshots.
import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';

// Derived from the public key in extension/manifest.template.json (checked by a test).
export const DEFAULT_EXTENSION_ID = 'dkalbkpfkomiienoddgbkngihfhbjinp';
const MAX_TABS = 500;
const MAX_BODY = '1mb';
const MAX_ACTIVE_TOKENS = 10;
const PENDING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PENDING_LIMIT = 10;
const USER_ID = 'demo-user';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const TabSchema = z.object({
  url: z
    .string()
    .max(2048)
    .refine((u) => /^https?:\/\//i.test(u), 'only http(s) urls'),
  title: z.string().max(1024),
  windowId: z.number().int(),
  index: z.number().int().min(0),
  pinned: z.boolean(),
  groupId: z.number().int(),
});
const SnapshotSchema = z.object({
  requestId: z.string().uuid(),
  configId: z.string().min(1).max(200),
  deviceId: z.string().uuid(),
  deviceName: z.string().min(1).max(100),
  capturedAt: z.string().datetime({ offset: true }),
  tabs: z.array(TabSchema).max(MAX_TABS),
});
const PendingQuery = z.object({ deviceId: z.string().uuid() });

export function createExtensionApi({ extensionId = DEFAULT_EXTENSION_ID } = {}) {
  const extensionOrigin = `chrome-extension://${extensionId}`;
  const tokens = new Map(); // id -> { id, userId, hash, createdAt, lastUsedAt, revokedAt }
  const syncRequests = []; // { userId, configId, requestId, createdAt }
  const snapshots = new Map(); // "userId|requestId|deviceId" -> snapshot (unique index in the real DB)

  const router = express.Router();

  // ---- strict CORS: extension endpoints answer only to the extension's own origin ------------
  const strictCors = (req, res, next) => {
    const origin = req.get('Origin');
    if (origin !== undefined && origin !== extensionOrigin) {
      return res.status(403).json({ error: 'origin_not_allowed' });
    }
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };

  const requireToken = (req, res, next) => {
    const m = /^Bearer (\S+)$/.exec(req.get('Authorization') ?? '');
    const hash = m ? sha256(m[1]) : null;
    const record = hash ? [...tokens.values()].find((t) => t.hash === hash && !t.revokedAt) : null;
    if (!record) return res.status(401).json({ error: 'unauthorized' });
    record.lastUsedAt = new Date().toISOString();
    req.userId = record.userId;
    next();
  };

  const extensionPaths = ['/api/extension/me', '/api/extension/pending', '/api/tab-snapshots'];
  router.use(extensionPaths, strictCors);

  router.get('/api/extension/me', requireToken, (req, res) => res.json({ userId: req.userId }));

  router.get('/api/extension/pending', requireToken, (req, res) => {
    const q = PendingQuery.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: 'invalid_query' });
    const since = Date.now() - PENDING_WINDOW_MS;
    const requests = syncRequests
      .filter((r) => r.userId === req.userId && Date.parse(r.createdAt) >= since)
      .filter((r) => !snapshots.has(`${r.userId}|${r.requestId}|${q.data.deviceId}`))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, PENDING_LIMIT)
      .map(({ requestId, configId, createdAt }) => ({ requestId, configId, createdAt }));
    res.json({ requests });
  });

  router.post('/api/tab-snapshots', requireToken, express.json({ limit: MAX_BODY }), (req, res) => {
    const parsed = SnapshotSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_body',
        issues: parsed.error.issues
          .slice(0, 5)
          .map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const body = parsed.data;
    const request = syncRequests.find(
      (r) => r.userId === req.userId && r.requestId === body.requestId,
    );
    if (!request) return res.status(404).json({ error: 'unknown_request' });
    if (request.configId !== body.configId)
      return res.status(422).json({ error: 'config_mismatch' });
    const key = `${req.userId}|${body.requestId}|${body.deviceId}`;
    if (snapshots.has(key)) return res.status(200).json({ ok: true, duplicate: true });
    snapshots.set(key, { userId: req.userId, ...body, receivedAt: new Date().toISOString() });
    res.status(201).json({ ok: true, duplicate: false });
  });

  // ---- token management: used by the signed-in web app, not by the extension -----------------
  // (The real backend authenticates these with the user's session; the mock has no sessions.)
  router.use('/api/extension/tokens', (req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  router.post('/api/extension/tokens', (_req, res) => {
    const active = [...tokens.values()].filter((t) => !t.revokedAt).length;
    if (active >= MAX_ACTIVE_TOKENS) return res.status(409).json({ error: 'too_many_tokens' });
    const token = `cct_${randomBytes(32).toString('base64url')}`;
    const record = {
      id: randomUUID(),
      userId: USER_ID,
      hash: sha256(token), // only the hash is kept
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    };
    tokens.set(record.id, record);
    // The only time the plain token is ever returned.
    res.status(201).json({ id: record.id, token, createdAt: record.createdAt });
  });

  router.get('/api/extension/tokens', (_req, res) => {
    res.json(
      [...tokens.values()]
        .filter((t) => !t.revokedAt)
        .map(({ id, createdAt, lastUsedAt }) => ({ id, createdAt, lastUsedAt })),
    );
  });

  router.delete('/api/extension/tokens/:id', (req, res) => {
    const record = tokens.get(req.params.id);
    if (!record || record.revokedAt) return res.status(404).json({ error: 'not_found' });
    record.revokedAt = new Date().toISOString();
    res.sendStatus(204);
  });

  // JSON errors (oversized or malformed bodies) instead of Express's HTML page.
  router.use((err, _req, res, next) => {
    if (!err) return next();
    const status = err.status ?? err.statusCode ?? 500;
    if (status === 413) return res.status(413).json({ error: 'body_too_large' });
    if (status === 400) return res.status(400).json({ error: 'invalid_json' });
    next(err);
  });

  return {
    router,
    extensionOrigin,
    /** Called when the user saves their config: creates the record the extensions will pick up. */
    createSyncRequest(configId, userId = USER_ID) {
      const record = {
        userId,
        configId,
        requestId: randomUUID(),
        createdAt: new Date().toISOString(),
      };
      syncRequests.push(record);
      return record;
    },
    listSnapshots: () => [...snapshots.values()],
    reset() {
      tokens.clear();
      syncRequests.length = 0;
      snapshots.clear();
    },
    /** For tests: what is stored for tokens (never the plain token). */
    _storedTokens: () => [...tokens.values()],
  };
}
