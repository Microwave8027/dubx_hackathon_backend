import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.string().default("development"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1),
  SESSION_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  DEFAULT_TIME_ZONE: z.string().default("UTC"),
  // How long before a block starts GET /blocks/due reports its "coming up" prompt.
  REMINDER_LEAD_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
  // Default look-ahead for POST /blocks/sync when the body has no `to`.
  SYNC_DAYS_AHEAD: z.coerce.number().int().min(1).max(365).default(14),
  // Defaults to true in production. Set to "false" only for plain-HTTP testing.
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`Invalid or missing environment variables (see .env.example):\n${problems}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  cookieSecure: (parsed.data.COOKIE_SECURE ?? String(parsed.data.NODE_ENV === "production")) === "true",
};
