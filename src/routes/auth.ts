import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { config } from "../config.ts";
import { CALENDAR_SCOPE, newOAuthClient, SCOPES } from "../google.ts";
import { User } from "../models/User.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import {
  bearerToken,
  createDesktopCode,
  issueApiToken,
  redeemDesktopCode,
  revokeApiToken,
} from "../services/tokens.ts";

export const authRouter = Router();

// Desktop login: the app listens on 127.0.0.1:<port>, opens /auth/google?port=..&state=..&challenge=..
// in the system browser (Google blocks OAuth inside embedded webviews), receives a one-time code
// on that port, and exchanges it plus its PKCE verifier at POST /auth/desktop/token.
const desktopQuery = z.object({
  port: z.coerce.number().int().min(1024).max(65535),
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/), // base64url(sha256(verifier))
});

function desktopRedirect(port: number, params: Record<string, string>) {
  return `http://127.0.0.1:${port}/callback?${new URLSearchParams(params)}`;
}

// Step 1: send the user to Google's consent screen.
authRouter.get("/google", (req, res, next) => {
  if (req.query.port !== undefined) {
    const desktop = desktopQuery.safeParse(req.query);
    if (!desktop.success) {
      res.status(400).json({ error: "Invalid desktop login parameters" });
      return;
    }
    req.session.desktopLogin = desktop.data;
  } else {
    delete req.session.desktopLogin;
  }

  const state = randomBytes(24).toString("hex");
  req.session.oauthState = state;
  req.session.save((err) => {
    if (err) return next(err);
    const url = newOAuthClient().generateAuthUrl({
      access_type: "offline", // get a refresh token
      prompt: "consent", // ensures the refresh token is returned on every login
      scope: SCOPES,
      state,
      include_granted_scopes: true,
    });
    res.redirect(url);
  });
});

// Step 2: Google redirects back here with ?code=...&state=...
authRouter.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const expected = req.session.oauthState;
  const desktop = req.session.desktopLogin;
  delete req.session.oauthState;
  delete req.session.desktopLogin;

  // Sends login failures back to whichever client started the login.
  const fail = (status: number, reason: string, message: string) => {
    if (desktop) res.redirect(desktopRedirect(desktop.port, { state: desktop.state, error: reason }));
    else if (reason === "missing_calendar_scope")
      res.redirect(`${config.CLIENT_ORIGIN}/?auth_error=${reason}`);
    else res.status(status).json({ error: message });
  };

  if (error) return fail(400, "access_denied", `Google OAuth error: ${String(error)}`);
  if (typeof code !== "string" || typeof state !== "string" || !expected || state !== expected) {
    // No trusted desktop context without a matching state, so answer the browser directly.
    res.status(400).json({ error: "Invalid OAuth state or missing code" });
    return;
  }

  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Google's consent screen lets users untick individual permissions. Without the calendar
  // scope every calendar call would fail with 403, so refuse the login up front.
  if (!(tokens.scope ?? "").split(" ").includes(CALENDAR_SCOPE)) {
    return fail(403, "missing_calendar_scope", "Calendar permission was not granted");
  }

  if (!tokens.id_token) return fail(502, "server_error", "Google did not return an ID token");
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.GOOGLE_CLIENT_ID,
  });
  const profile = ticket.getPayload();
  if (!profile?.sub || !profile.email) {
    return fail(502, "server_error", "Google profile is missing required fields");
  }

  // Create the user's data record on first login; update profile + tokens on later logins.
  const set: Record<string, unknown> = {
    email: profile.email,
    name: profile.name ?? "",
    picture: profile.picture ?? "",
    accessToken: tokens.access_token,
    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
    lastLoginAt: new Date(),
  };
  // Google only sends a refresh token on consent; never overwrite a stored one with nothing.
  if (tokens.refresh_token) set.refreshToken = tokens.refresh_token;

  const user = await User.findOneAndUpdate(
    { googleId: profile.sub },
    { $set: set, $setOnInsert: { googleId: profile.sub } },
    { upsert: true, returnDocument: "after" },
  );

  if (desktop) {
    // The desktop app gets a bearer token instead of this browser session.
    const oneTimeCode = await createDesktopCode(user.id, desktop.challenge);
    req.session.destroy(() =>
      res.redirect(desktopRedirect(desktop.port, { state: desktop.state, code: oneTimeCode })),
    );
    return;
  }

  // Rotate the session id on login to prevent session fixation.
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Could not create session" });
      return;
    }
    req.session.userId = user.id;
    req.session.save(() => res.redirect(config.CLIENT_ORIGIN));
  });
});

const tokenBody = z.object({
  code: z.string().min(1).max(200),
  verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
  deviceName: z.string().max(100).default("desktop"),
});

// POST /auth/desktop/token { code, verifier, deviceName? } -> { token, user }
authRouter.post("/desktop/token", async (req, res) => {
  const body = tokenBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "code and verifier are required" });
    return;
  }
  const userId = await redeemDesktopCode(body.data.code, body.data.verifier);
  const user = userId ? await User.findById(userId) : null;
  if (!user) {
    res.status(400).json({ error: "Login code is invalid or expired. Sign in again." });
    return;
  }
  const token = await issueApiToken(user.id, body.data.deviceName);
  res.status(201).json({ token, user: publicUser(user) });
});

function publicUser(user: { id: string; email: string; name?: string | null; picture?: string | null }) {
  return { id: user.id, email: user.email, name: user.name ?? "", picture: user.picture ?? "" };
}

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  res.json(publicUser(user));
});

// Ends the browser session, or revokes the bearer token the request was made with.
authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = bearerToken(req.get("authorization"));
  if (token) await revokeApiToken(token);
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});
