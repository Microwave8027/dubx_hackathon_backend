import type { RequestHandler } from "express";
import { bearerToken, userIdForToken } from "../services/tokens.ts";

/** Accepts a browser session cookie or a desktop bearer token; sets `req.userId`. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = bearerToken(req.get("authorization"));
  if (token) {
    const userId = await userIdForToken(token);
    if (!userId) {
      res.status(401).json({ error: "Invalid or expired token. Sign in again." });
      return;
    }
    req.userId = userId;
    return next();
  }
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated. Visit /auth/google to log in." });
    return;
  }
  req.userId = req.session.userId;
  next();
};
