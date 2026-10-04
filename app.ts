import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import { config } from "./src/config.ts";
import { connectDb } from "./src/db.ts";
import { authRouter } from "./src/routes/auth.ts";
import { blocksRouter } from "./src/routes/blocks.ts";
import { configsRouter } from "./src/routes/configs.ts";
import { scheduleRouter } from "./src/routes/schedule.ts";

// The Express app, with no listener: Vercel discovers this default export (app.ts at the project
// root) and runs it per request; local.ts wraps it in a server for Docker and `bun run dev`.
const app = express();
if (config.isProd) app.set("trust proxy", 1); // needed for secure cookies behind a proxy

app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "100kb" }));

// `api` lets clients (the desktop app) tell an outdated backend from a current one.
// Bump it when the desktop app starts depending on new routes.
const API_VERSION = 4;

app.get("/", (_req, res) => {
  res.json({ name: "dubx", api: API_VERSION, health: "/health" });
});
app.get("/health", (_req, res) => {
  res.json({ ok: true, api: API_VERSION });
});

// Connect lazily (cached across requests) instead of at boot, which serverless can't do.
const connected = connectDb();
connected.catch(() => {}); // failures surface per request below; avoids an unhandled rejection at import
app.use(async (_req, _res, next) => {
  await connected.catch(() => connectDb()); // retry once if the first attempt failed
  next();
});

app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ clientPromise: connected.then((m) => m.connection.getClient()) }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  }),
);

app.use("/auth", authRouter);
app.use("/schedule", scheduleRouter);
app.use("/blocks", blocksRouter);
app.use("/configs", configsRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  const status =
    typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
};
app.use(errorHandler);

export default app;
