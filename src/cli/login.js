// Establish (or refresh) a Superbru session locally, then print a portable seed
// you can paste into Railway as SUPERBRU_STATE_B64 — so the deployed bot reuses
// your logged-in session instead of logging in fresh from a datacenter IP.
//
//   npm run login            # headless
//   npm run login -- --show  # visible browser (use if a CAPTCHA/check appears)
//
// Needs SUPERBRU_EMAIL / SUPERBRU_PASSWORD in your local .env.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withSession } from "../superbru.js";
import { config } from "../config.js";

const headless = !process.argv.includes("--show");

// withSession logs in if needed and saves the session to auth/state.json.
await withSession(async () => {
  console.log("login: session is valid.");
}, { headless });

const statePath = join(config.authDir, "state.json");
const b64 = Buffer.from(readFileSync(statePath, "utf8"), "utf8").toString("base64");

console.log(`\nSession saved to ${statePath}`);
console.log("\nTo persist on Railway WITHOUT a volume, set this env var and redeploy:\n");
console.log(`SUPERBRU_STATE_B64=${b64}\n`);
console.log(`(${b64.length} chars — the bot reuses this until the session expires.)`);
