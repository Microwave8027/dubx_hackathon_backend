import { OAuth2Client, type Credentials } from "google-auth-library";
import { config } from "./config.ts";
import { User } from "./models/User.ts";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const SCOPES = [
  "openid",
  "email",
  "profile",
  // Create/delete events on the user's calendars (no access to other calendar settings).
  CALENDAR_SCOPE,
];

export function newOAuthClient(): OAuth2Client {
  return new OAuth2Client(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI,
  );
}

/** Returns an OAuth client loaded with the user's stored tokens; persists refreshed tokens. */
export async function clientForUser(userId: string): Promise<OAuth2Client | null> {
  const user = await User.findById(userId).select("+accessToken +refreshToken +tokenExpiry");
  if (!user || (!user.refreshToken && !user.accessToken)) return null;

  const client = newOAuthClient();
  client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expiry_date: user.tokenExpiry?.getTime(),
  });
  client.on("tokens", (t: Credentials) => {
    const update: Record<string, unknown> = {};
    if (t.access_token) update.accessToken = t.access_token;
    if (t.refresh_token) update.refreshToken = t.refresh_token;
    if (t.expiry_date) update.tokenExpiry = new Date(t.expiry_date);
    User.updateOne({ _id: user._id }, update).catch((e) =>
      console.error("Failed to persist refreshed Google tokens:", e),
    );
  });
  return client;
}
