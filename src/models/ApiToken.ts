import { Schema, model } from "mongoose";

// Long-lived bearer tokens for native clients (the desktop app), which can't hold a browser
// session cookie. Only a SHA-256 hash of the token is stored.
const apiTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
apiTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ApiToken = model("ApiToken", apiTokenSchema);

// One-time codes handed to the desktop app's loopback listener after Google login. The app
// exchanges one (with its PKCE verifier) for an ApiToken within a couple of minutes.
const desktopLoginCodeSchema = new Schema({
  codeHash: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  challenge: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
desktopLoginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DesktopLoginCode = model("DesktopLoginCode", desktopLoginCodeSchema);
