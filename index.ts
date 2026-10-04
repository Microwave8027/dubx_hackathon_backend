import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import { config } from "./src/config.ts";
import { authRouter } from "./src/routes/auth.ts";
import { blocksRouter } from "./src/routes/blocks.ts";
import { configsRouter } from "./src/routes/configs.ts";
import { scheduleRouter } from "./src/routes/schedule.ts";
import { scheduler } from "./src/services/scheduler.ts";

await mongoose.connect(config.MONGODB_URI);
console.log("Connected to MongoDB");
console.log(`Scheduler loaded ${await scheduler.load()} upcoming block(s)`);

const app = express();
if (config.isProd) app.set("trust proxy", 1); // needed for secure cookies behind a proxy

app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ client: mongoose.connection.getClient() }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.cookieSecure,
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  }),
);

// `api` lets clients (the desktop app) tell an outdated backend image from a current one.
// Bump it when the desktop app starts depending on new routes.
const API_VERSION = 3;

app.get("/health", (_req, res) => {
  res.json({ ok: true, api: API_VERSION });
});
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

app.listen(config.PORT, () => {
  console.log(`Server listening on http://localhost:${config.PORT}`);
});
