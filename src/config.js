import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader — avoids a dependency. Only sets vars not already in the
// environment, so real env vars (e.g. on the VPS) always win.
function loadEnv() {
  let raw;
  try {
    raw = readFileSync(join(root, ".env"), "utf8");
  } catch {
    return; // no .env file — fine if vars come from the real environment
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

export function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

// Where mutable state (session + sent record) lives. Defaults to the repo, but
// can point at a mounted volume on Railway via STATE_DIR so it survives restarts
// without shadowing the baked-in data/fixtures.json.
const stateDir = process.env.STATE_DIR || root;

export const config = {
  root,
  stateDir,
  authDir: join(stateDir, "auth"),
  sentPath: join(stateDir, "sent.json"),
  get telegramToken() {
    return required("TELEGRAM_BOT_TOKEN");
  },
  get telegramChatId() {
    return required("TELEGRAM_CHAT_ID");
  },
  get superbruEmail() {
    return required("SUPERBRU_EMAIL");
  },
  get superbruPassword() {
    return required("SUPERBRU_PASSWORD");
  },
  get superbruPoolUrl() {
    return process.env.SUPERBRU_POOL_URL || "https://www.superbru.com/player/dashboard.php";
  },
  get poolId() {
    return process.env.SUPERBRU_POOL_ID || "13208945";
  },
  // The current round's internal id (the pool_view `g` param). Round 1 = 4.
  get game() {
    return process.env.SUPERBRU_GAME || "4";
  },
  get sendOffsetMinutes() {
    return Number(process.env.SEND_OFFSET_MINUTES || 0);
  },
  get sendWindowMinutes() {
    return Number(process.env.SEND_WINDOW_MINUTES || 120);
  },
  // Results post a while after kickoff, once the match is over and graded. We
  // start checking RESULT_OFFSET_MINUTES after kickoff and keep retrying (until
  // the points are in) for RESULT_WINDOW_MINUTES — generous enough to cover
  // stoppage/extra time and a late grading.
  get resultOffsetMinutes() {
    return Number(process.env.RESULT_OFFSET_MINUTES || 110);
  },
  get resultWindowMinutes() {
    return Number(process.env.RESULT_WINDOW_MINUTES || 240);
  },
};
