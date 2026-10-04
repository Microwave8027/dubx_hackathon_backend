import { Router, type Response } from "express";
import { mongo } from "mongoose";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.ts";
import { Config, serializeConfig, type ConfigDoc } from "../models/Config.ts";
import { MAX_WINDOWS, windowInput } from "../models/Window.ts";

export const configsRouter = Router();
configsRouter.use(requireAuth);

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const MAX_CONFIGS = 200;

const configBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(""),
  windows: z.array(windowInput).min(1, "a configuration needs at least one window").max(MAX_WINDOWS),
});

// PUT accepts any subset: rename, edit the description, and/or replace the windows.
const updateBody = z.object({
  name: configBody.shape.name.optional(),
  description: z.string().max(1000).optional(),
  windows: configBody.shape.windows.optional(),
});

function badRequest(res: Response, error: z.ZodError) {
  const issue = error.issues[0];
  res.status(400).json({ error: `${issue?.path.join(".") || "body"}: ${issue?.message}` });
}

function isDuplicateName(err: unknown) {
  return err instanceof mongo.MongoServerError && err.code === 11000;
}

const DUPLICATE = "You already have a configuration with that name";

async function findOwnConfig(userId: string, id: string, res: Response) {
  const config = OBJECT_ID.test(id) ? await Config.findOne({ _id: id, userId }) : null;
  if (!config) res.status(404).json({ error: "Configuration not found" });
  return config;
}

// GET /configs -> the user's configurations, most recently used (or updated) first
configsRouter.get("/", async (req, res) => {
  const configs = await Config.find({ userId: req.userId })
    .sort({ lastUsedAt: -1, updatedAt: -1 })
    .lean<ConfigDoc[]>();
  res.json(configs.map(serializeConfig));
});

// POST /configs { name, description?, windows } -> saves the windows the user picked
configsRouter.post("/", async (req, res) => {
  const body = configBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  if ((await Config.countDocuments({ userId: req.userId })) >= MAX_CONFIGS) {
    res.status(409).json({ error: `You can keep at most ${MAX_CONFIGS} configurations` });
    return;
  }
  try {
    const config = await Config.create({ ...body.data, userId: req.userId });
    res.status(201).json(serializeConfig(config));
  } catch (err) {
    if (!isDuplicateName(err)) throw err;
    res.status(409).json({ error: DUPLICATE });
  }
});

// GET /configs/:id
configsRouter.get("/:id", async (req, res) => {
  const config = await findOwnConfig(req.userId!, req.params.id, res);
  if (config) res.json(serializeConfig(config));
});

// PUT /configs/:id { name?, description?, windows? }
configsRouter.put("/:id", async (req, res) => {
  const body = updateBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  const config = await findOwnConfig(req.userId!, req.params.id, res);
  if (!config) return;
  config.set(Object.fromEntries(Object.entries(body.data).filter(([, v]) => v !== undefined)));
  try {
    await config.save();
  } catch (err) {
    if (!isDuplicateName(err)) throw err;
    res.status(409).json({ error: DUPLICATE });
    return;
  }
  res.json(serializeConfig(config));
});

// POST /configs/:id/used -> records that the configuration was just loaded (for sorting)
configsRouter.post("/:id/used", async (req, res) => {
  const config = await findOwnConfig(req.userId!, req.params.id, res);
  if (!config) return;
  config.lastUsedAt = new Date();
  await config.save();
  res.json(serializeConfig(config));
});

// DELETE /configs/:id
configsRouter.delete("/:id", async (req, res) => {
  const config = await findOwnConfig(req.userId!, req.params.id, res);
  if (!config) return;
  await config.deleteOne();
  res.status(204).end();
});
