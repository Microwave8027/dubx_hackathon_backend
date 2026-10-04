import mongoose from "mongoose";
import { config } from "./config.ts";

// Serverless instances are reused across requests but start cold often, so the connection is
// opened lazily and cached on globalThis (which also survives dev hot reloads).
const g = globalThis as typeof globalThis & { __dubxMongo?: Promise<typeof mongoose> };

export function connectDb(): Promise<typeof mongoose> {
  g.__dubxMongo ??= mongoose
    .connect(config.MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 5, // one function instance serves few concurrent requests; keep Atlas connections low
    })
    .catch((err) => {
      g.__dubxMongo = undefined; // retry on the next request instead of caching the failure
      throw err;
    });
  return g.__dubxMongo;
}
