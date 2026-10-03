// Mock daemon: Express + ws implementing the whole Command Center contract.
import express from 'express';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { ACTION_CATEGORIES, SCRIPTS, createState, id, now } from './state.js';
import { contextScreenshotSvg, makeFrame } from './frames.js';

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const STEP_MS = Number(process.env.MOCK_STEP_MS ?? 6000);
const APPROVAL_EVERY_MS = Number(process.env.MOCK_APPROVAL_MS ?? 30000);
const FRAME_MS = 500;

// A throwaway P-256 key so the browser's pushManager.subscribe() accepts the key in dev.
// The mock never sends pushes. Override with MOCK_VAPID_PUBLIC_KEY.
function makeVapidPublicKey() {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
  return raw.toString('base64url');
}

export function createMock({ autoStart = true } = {}) {
  const state = createState();
  const vapidPublicKey = process.env.MOCK_VAPID_PUBLIC_KEY ?? makeVapidPublicKey();
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/events' });
  const runtime = new Map(); // layerId -> { script, stepIndex, timer, tick }
  const timers = [];

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json());

  const broadcast = (type, data) => {
    const msg = JSON.stringify({ type, data });
    for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
  };
  const emitTask = (t) => broadcast('task.updated', t);
  const emitLayer = (l) => broadcast('layer.updated', l);

  function addLog(layer, entry) {
    const e = { id: id('log'), layerId: layer.id, ts: now(), ...entry };
    state.log.unshift(e);
    return e;
  }

  function startLayer(key, taskOverrides = {}) {
    const script = SCRIPTS[key];
    const task = {
      id: id('task'),
      text: script.text,
      status: 'running',
      weight: script.weight,
      createdAt: now(),
      ...taskOverrides,
    };
    const layer = {
      id: id('layer'),
      taskId: task.id,
      status: 'running',
      usesScreen: script.usesScreen,
      steps: script.steps.map((s, i) => ({
        id: `s${i}`,
        text: s.text,
        status: i === 0 ? 'active' : 'pending',
      })),
    };
    task.layerId = layer.id;
    state.tasks.set(task.id, task);
    state.layers.set(layer.id, layer);
    runtime.set(layer.id, { script, stepIndex: 0, tick: 0, waiting: null });
    emitTask(task);
    emitLayer(layer);
    return { task, layer };
  }

  function finishLayer(layer, task, ok = true) {
    layer.status = ok ? 'done' : 'error';
    task.status = ok ? 'done' : 'failed';
    if (ok) {
      task.result = { summary: `Completed: ${task.text}`, files: [] };
    }
    emitLayer(layer);
    emitTask(task);
  }

  function raiseApproval(layer, task, spec) {
    const a = {
      id: id('appr'),
      layerId: layer.id,
      taskId: task.id,
      action: { category: spec.category, summary: spec.summary, details: spec.details },
      status: 'pending',
      screenshotUrl: `${baseUrl()}/screenshots/${layer.id}.svg?text=${encodeURIComponent(spec.summary)}`,
      createdAt: now(),
    };
    state.approvals.set(a.id, a);
    layer.status = 'waiting_approval';
    task.status = 'waiting_approval';
    emitLayer(layer);
    emitTask(task);
    broadcast('approval.requested', a);
    return a;
  }

  function baseUrl() {
    return `http://localhost:${PORT}`;
  }

  function advance(layer) {
    const rt = runtime.get(layer.id);
    const task = state.tasks.get(layer.taskId);
    if (!rt || layer.status !== 'running') return;
    const step = rt.script.steps[rt.stepIndex];
    if (step.approval && !rt.approvedStep) {
      rt.waiting = raiseApproval(layer, task, step.approval).id;
      return;
    }
    rt.approvedStep = false;
    layer.steps[rt.stepIndex].status = 'done';
    if (step.log) addLog(layer, step.log);
    rt.stepIndex += 1;
    if (rt.stepIndex >= layer.steps.length) {
      finishLayer(layer, task);
    } else {
      layer.steps[rt.stepIndex].status = 'active';
      emitLayer(layer);
    }
    emitLayer(layer);
  }

  function tickLoop() {
    for (const layer of state.layers.values()) advance(layer);
  }

  function frameLoop() {
    for (const layer of state.layers.values()) {
      const rt = runtime.get(layer.id);
      if (!rt || layer.status === 'killed' || layer.status === 'done') continue;
      if (layer.status === 'paused') continue;
      rt.tick += 1;
      const done = layer.steps.filter((s) => s.status === 'done').length;
      broadcast('layer.frame', {
        layerId: layer.id,
        ts: Date.now(),
        jpegBase64: makeFrame(rt.script.hue, rt.tick, done / layer.steps.length),
      });
    }
  }

  function seedDefaults() {
    startLayer('research');
    startLayer('downloads');
    startLayer('email');
    state.tasks.set('task_queued', {
      id: 'task_queued',
      text: 'Tidy the project notes folder',
      status: 'queued',
      weight: 'routine',
      createdAt: now(),
    });
  }

  function randomApproval() {
    const running = [...state.layers.values()].filter((l) => l.status === 'running');
    const layer = running[Math.floor(Math.random() * running.length)];
    if (!layer) return;
    const task = state.tasks.get(layer.taskId);
    const category = ['install_software', 'use_screen', 'write_files'][
      Math.floor(Math.random() * 3)
    ];
    const rt = runtime.get(layer.id);
    rt.waiting = raiseApproval(layer, task, {
      category,
      summary: `Run "${category.replace('_', ' ')}" for "${task.text}"`,
    }).id;
    rt.adhoc = true;
  }

  function resolveApproval(a, status) {
    a.status = status;
    a.resolvedAt = now();
    const layer = state.layers.get(a.layerId);
    const task = state.tasks.get(a.taskId);
    const rt = runtime.get(a.layerId);
    if (layer && task && layer.status === 'waiting_approval') {
      const gated = rt && !rt.adhoc;
      layer.status = 'running';
      task.status = 'running';
      if (rt) {
        rt.waiting = null;
        rt.adhoc = false;
        if (gated && status === 'approved') rt.approvedStep = true;
      }
      if (gated && status !== 'approved' && rt) {
        // Denied: the gated step fails and the layer stops.
        layer.steps[rt.stepIndex].status = 'failed';
        finishLayer(layer, task, false);
      } else {
        emitLayer(layer);
        emitTask(task);
      }
    }
    broadcast('approval.resolved', a);
    return a;
  }

  const notFound = (res) => res.status(404).json({ error: 'not_found' });

  // Tasks
  app.get('/tasks', (_req, res) => res.json([...state.tasks.values()]));
  app.post('/tasks', (req, res) => {
    const { text, weight = 'routine', scheduledFor } = req.body ?? {};
    if (typeof text !== 'string' || !text.trim())
      return res.status(400).json({ error: 'text_required' });
    const task = {
      id: id('task'),
      text: text.trim(),
      status: scheduledFor ? 'scheduled' : 'queued',
      weight,
      scheduledFor,
      createdAt: now(),
    };
    state.tasks.set(task.id, task);
    emitTask(task);
    // A queued task picks up a fresh layer shortly after.
    if (!scheduledFor) {
      timers.push(
        setTimeout(() => {
          const key = ['research', 'downloads', 'email'][state.tasks.size % 3];
          const t = state.tasks.get(task.id);
          if (!t || t.status !== 'queued') return;
          const { layer } = startLayer(key, {
            text: t.text,
            weight: t.weight,
            id: t.id,
            createdAt: t.createdAt,
          });
          t.layerId = layer.id;
        }, 1500),
      );
    }
    res.status(201).json(task);
  });
  app.patch('/tasks/:id', (req, res) => {
    const t = state.tasks.get(req.params.id);
    if (!t) return notFound(res);
    Object.assign(t, req.body ?? {});
    emitTask(t);
    res.json(t);
  });

  // Layers
  app.get('/layers', (_req, res) => res.json([...state.layers.values()]));
  const layerAction = (name, fn) =>
    app.post(`/layers/:id/${name}`, (req, res) => {
      const layer = state.layers.get(req.params.id);
      if (!layer) return notFound(res);
      const task = state.tasks.get(layer.taskId);
      const err = fn(layer, task, req.body ?? {});
      if (err) return res.status(409).json({ error: err });
      emitLayer(layer);
      emitTask(task);
      res.json(layer);
    });
  layerAction('pause', (l) => {
    if (l.status !== 'running') return 'not_running';
    l.status = 'paused';
  });
  layerAction('resume', (l) => {
    if (l.status !== 'paused') return 'not_paused';
    l.status = 'running';
  });
  layerAction('kill', (l, t) => {
    if (['done', 'killed'].includes(l.status)) return 'already_finished';
    l.status = 'killed';
    t.status = 'cancelled';
    for (const s of l.steps) if (s.status === 'active') s.status = 'failed';
    for (const a of state.approvals.values()) {
      if (a.layerId === l.id && a.status === 'pending') {
        a.status = 'expired';
        a.resolvedAt = now();
        broadcast('approval.resolved', a);
      }
    }
  });
  layerAction('redirect', (l, _t, body) => {
    if (typeof body.instruction !== 'string' || !body.instruction.trim())
      return 'instruction_required';
    const rt = runtime.get(l.id);
    const at = rt ? rt.stepIndex : 0;
    l.steps.splice(at + 1, 0, {
      id: id('s'),
      text: `Redirect: ${body.instruction.trim()}`,
      status: 'pending',
    });
    rt?.script.steps.splice(at + 1, 0, { text: body.instruction });
  });

  // Approvals
  app.get('/approvals', (_req, res) => res.json([...state.approvals.values()]));
  for (const [name, status] of [
    ['approve', 'approved'],
    ['deny', 'denied'],
  ]) {
    app.post(`/approvals/:id/${name}`, (req, res) => {
      const a = state.approvals.get(req.params.id);
      if (!a) return notFound(res);
      if (a.status !== 'pending') return res.status(409).json({ error: 'already_resolved' });
      res.json(resolveApproval(a, status));
    });
  }
  app.get('/screenshots/:file', (req, res) => {
    res
      .type('image/svg+xml')
      .send(contextScreenshotSvg(String(req.query.text ?? 'Action requested')));
  });

  // Profile
  app.get('/profile', (_req, res) => res.json(state.profile));
  app.put('/profile', (req, res) => {
    const p = req.body;
    if (!p || !ACTION_CATEGORIES.every((c) => ['auto', 'ask', 'never'].includes(p.tiers?.[c]))) {
      return res.status(400).json({ error: 'invalid_profile' });
    }
    // Locked categories cannot be loosened.
    p.tiers.make_payment = 'never';
    p.tiers.delete_files = 'never';
    state.profile = p;
    res.json(state.profile);
  });

  // Log, briefing
  app.get('/log', (req, res) => {
    const { layerId, category } = req.query;
    res.json(
      state.log.filter(
        (e) => (!layerId || e.layerId === layerId) && (!category || e.category === category),
      ),
    );
  });
  app.get('/briefing/latest', (_req, res) => {
    res.json(buildBriefing());
  });
  function buildBriefing() {
    const finished = [...state.tasks.values()].filter((t) => t.status === 'done');
    const pending = [...state.approvals.values()].filter((a) => a.status === 'pending');
    return {
      id: 'brief_latest',
      kind: new Date().getHours() < 14 ? 'morning' : 'evening',
      generatedAt: now(),
      summary: `${finished.length} task(s) finished, ${pending.length} waiting on you.`,
      finished: finished.map((t) => ({ taskId: t.id, text: t.text, summary: t.result?.summary })),
      approvalIds: pending.map((a) => a.id),
    };
  }

  // Proposed additions
  app.post('/log/:id/undo', (req, res) => {
    const e = state.log.find((x) => x.id === req.params.id);
    if (!e) return notFound(res);
    if (!e.reversible || e.undone) return res.status(409).json({ error: 'not_undoable' });
    e.undone = true;
    res.json(e);
  });
  app.get('/push/vapid-key', (_req, res) => res.json({ publicKey: vapidPublicKey }));
  app.post('/push/subscribe', (_req, res) => res.status(201).json({ ok: true }));
  app.post('/pairing/start', (req, res) => {
    const token = id('pair');
    const origin = req.get('origin') ?? process.env.MOCK_APP_URL ?? 'http://localhost:1420';
    state.pairings.push({ token, createdAt: now() });
    res.json({
      url: `${origin}/pair?token=${token}&api=${encodeURIComponent(baseUrl())}`,
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  });

  // Mock-only helpers
  app.post('/__mock/demo', (_req, res) => {
    reset();
    seedDefaults();
    res.json({ ok: true });
  });
  app.post('/__mock/reset', (_req, res) => {
    reset();
    seedDefaults();
    res.json({ ok: true });
  });

  function reset() {
    state.tasks.clear();
    state.layers.clear();
    state.approvals.clear();
    state.log.length = 0;
    runtime.clear();
  }

  wss.on('connection', (ws) => {
    ws.on('error', () => {});
  });

  return {
    app,
    server,
    state,
    start() {
      return new Promise((resolve) => {
        server.listen(PORT, () => {
          if (autoStart) {
            seedDefaults();
            timers.push(setInterval(tickLoop, STEP_MS));
            timers.push(setInterval(frameLoop, FRAME_MS));
            timers.push(setInterval(randomApproval, APPROVAL_EVERY_MS));
          }
          resolve(PORT);
        });
      });
    },
    stop() {
      timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      wss.close();
      server.close();
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createMock()
    .start()
    .then((port) => console.log(`Mock daemon listening on http://localhost:${port}`));
}
