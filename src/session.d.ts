import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    oauthState?: string;
    // Set when the login was started by the desktop app (loopback redirect + PKCE).
    desktopLogin?: { port: number; state: string; challenge: string };
  }
}

declare module "express-serve-static-core" {
  interface Request {
    /** Authenticated user, set by requireAuth (from the session or a bearer token). */
    userId?: string;
  }
}
