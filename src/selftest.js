import { config } from "./config.js";
import { withSession, scrapeLeaderboard, scrapeRoundPicks } from "./superbru.js";
import { formatUpdate } from "./format.js";
import { sendMessage } from "./telegram.js";

/**
 * On-demand end-to-end check, used to validate a deploy without waiting for a
 * match. `spec` (from the SELFTEST env var):
 *   - any truthy value  → send a plain Telegram ping (verifies token + chat id)
 *   - a match number    → ALSO scrape that match + standings and send the real
 *                         update (verifies Superbru login + scrape + format)
 *
 * Run a completed match (e.g. SELFTEST=5 = Qatar-Switzerland) to get a real,
 * fully-populated message in the group.
 */
export async function selfTest(spec) {
  // 1. Telegram only — isolates "chat not found" from any Superbru issue.
  const ping = await sendMessage(
    "✅ <b>Superbru bot self-test</b>\nDeploy is alive and Telegram works.",
  );
  console.log(`selftest: Telegram ping ok (message ${ping.message_id}).`);

  const game = Number(spec);
  if (!Number.isInteger(game) || game <= 0) {
    console.log("selftest: no match number given — skipping the Superbru check.");
    return;
  }

  // 2. Full pipeline: login + scrape a real match + standings + send.
  await withSession(async (page) => {
    const leaderboard = await scrapeLeaderboard(page, config.poolId);
    const match = (await scrapeRoundPicks(page, config.poolId, String(game)))[0];
    if (!match) {
      await sendMessage(`⚠️ Self-test: couldn't find match g=${game}.`);
      console.log(`selftest: no match found for g=${game}.`);
      return;
    }
    const message =
      "🧪 <b>SELF-TEST</b> (not a live alert)\n\n" +
      formatUpdate({
        fixture: { home: match.home, away: match.away, competition: "World Cup Predictor" },
        picks: match.picks,
        standings: leaderboard,
        dashboardUrl: "https://www.superbru.com/player/dashboard.php",
      });
    const res = await sendMessage(message);
    console.log(`selftest: full pipeline ok — sent g=${game} (message ${res.message_id}).`);
  });
}
