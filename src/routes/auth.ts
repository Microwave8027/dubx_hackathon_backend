import { Router } from "express";
import { randomBytes } from "node:crypto";
import { config } from "../config.ts";
import { CALENDAR_SCOPE, newOAuthClient, SCOPES } from "../google.ts";
import { User } from "../models/User.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

export const authRouter = Router();

// Step 1: send the user to Google's consent screen.
authRouter.get("/google", (req, res, next) => {
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
  delete req.session.oauthState;

  if (error) {
    res.status(400).json({ error: `Google OAuth error: ${String(error)}` });
    return;
  }
  if (typeof code !== "string" || typeof state !== "string" || !expected || state !== expected) {
    res.status(400).json({ error: "Invalid OAuth state or missing code" });
    return;
  }

  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  // Google's consent screen lets users untick individual permissions. Without the calendar
  // scope every calendar call would fail with 403, so refuse the login up front.
  if (!(tokens.scope ?? "").split(" ").includes(CALENDAR_SCOPE)) {
    res.redirect(`${config.CLIENT_ORIGIN}/?auth_error=missing_calendar_scope`);
    return;
  }

  if (!tokens.id_token) {
    res.status(502).json({ error: "Google did not return an ID token" });
    return;
  }
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.GOOGLE_CLIENT_ID,
  });
  const profile = ticket.getPayload();
  if (!profile?.sub || !profile.email) {
    res.status(502).json({ error: "Google profile is missing required fields" });
    return;
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

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.userId);
  if (!user) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name, picture: user.picture });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});
