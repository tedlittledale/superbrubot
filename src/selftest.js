import { config } from "./config.js";
import {
  withSession,
  scrapeLeaderboard,
  scrapeRoundPicks,
  findMatchPicks,
} from "./superbru.js";
import { formatUpdate, formatResult } from "./format.js";
import { sendMessage, escapeHtml } from "./telegram.js";
import { loadFixtures } from "./schedule.js";

const DASHBOARD_URL = "https://www.superbru.com/player/dashboard.php";

/** The most recently kicked-off fixture (the "previous match"), or null. */
function previousFixture(now = new Date()) {
  const past = loadFixtures()
    .filter((f) => new Date(f.kickoffUtc).getTime() <= now.getTime())
    .sort((a, b) => new Date(b.kickoffUtc) - new Date(a.kickoffUtc));
  return past[0] || null;
}

/**
 * On-demand end-to-end check, used to validate a deploy without waiting for a
 * match. Set the SELFTEST env var (and redeploy) and `spec` is its value:
 *   - "ping"            → send only a plain Telegram ping (token + chat id)
 *   - "1" / unset / any → predictions + results for the PREVIOUS match (the
 *                         most recently kicked-off fixture) — a full sense check
 *                         of both live notifications on every deploy
 *   - a match number    → use that specific match (the pool_view `g`) instead
 *
 * Both messages are clearly prefixed so the group knows it's a self-test.
 */
export async function selfTest(spec) {
  // 1. Telegram only — isolates "chat not found" from any Superbru issue.
  const ping = await sendMessage(
    "✅ <b>Superbru bot self-test</b>\nDeploy is alive and Telegram works.",
  );
  console.log(`selftest: Telegram ping ok (message ${ping.message_id}).`);

  const value = String(spec ?? "").trim().toLowerCase();
  if (value === "ping") {
    console.log("selftest: ping-only mode — skipping the Superbru check.");
    return;
  }

  // A number > 1 selects a specific match; "1"/""/anything else → previous match.
  // (Real match numbers start at 4, so "1" is treated as the simple on-switch.)
  const explicit = Number(value);
  const useNumber = Number.isInteger(explicit) && explicit > 1;

  // 2. Full pipeline: login + scrape the chosen match + standings, then post
  //    BOTH the predictions and the results messages so each deploy shows how
  //    both live notifications look on real data. Any failure in here is
  //    reported to Telegram (not just the logs) so a silent "only got the ping"
  //    deploy tells you *why* the Superbru side fell over.
  try {
    await withSession(async (page) => {
      await runSuperbruCheck(page, { useNumber, explicit });
    });
  } catch (err) {
    await sendMessage(`⚠️ Self-test: Superbru step failed — ${escapeHtml(err.message)}`).catch(
      () => {},
    );
    console.error("selftest: Superbru step failed:", err);
    throw err;
  }
}

async function runSuperbruCheck(page, { useNumber, explicit }) {
  const leaderboard = await scrapeLeaderboard(page, config.poolId);

  let match;
  let fixture;
  if (useNumber) {
    match = (await scrapeRoundPicks(page, config.poolId, String(explicit)))[0];
    fixture = match
      ? { home: match.home, away: match.away, competition: "World Cup Predictor" }
      : null;
  } else {
    const prev = previousFixture();
    if (!prev) {
      await sendMessage("⚠️ Self-test: no past fixture found to test with.");
      console.log("selftest: no past fixture in data/fixtures.json.");
      return;
    }
    match = await findMatchPicks(page, config.poolId, prev.game, prev.home, prev.away);
    fixture = { home: prev.homeName, away: prev.awayName, competition: "World Cup Predictor" };
  }

  if (!match) {
    await sendMessage(`⚠️ Self-test: couldn't find the test match${useNumber ? ` g=${explicit}` : ""}.`);
    console.log("selftest: test match not found.");
    return;
  }

  const predictions =
    "🧪 <b>SELF-TEST — predictions</b> (not a live alert)\n\n" +
    formatUpdate({
      fixture,
      picks: match.picks,
      standings: leaderboard,
      dashboardUrl: DASHBOARD_URL,
    });
  const a = await sendMessage(predictions);

  const results =
    "🧪 <b>SELF-TEST — result</b> (not a live alert)\n\n" +
    formatResult({
      fixture,
      result: match.result,
      picks: match.picks,
      standings: leaderboard,
      dashboardUrl: DASHBOARD_URL,
    });
  const b = await sendMessage(results);

  console.log(
    `selftest: full pipeline ok — sent predictions (${a.message_id}) + result (${b.message_id}).`,
  );
}
