import { config } from "./config.js";
import { withSession, scrapeLeaderboard, findMatchPicks, picksRevealed } from "./superbru.js";
import { formatUpdate } from "./format.js";
import { sendMessage } from "./telegram.js";
import { dueFixtures, loadSent, markSent, fixtureKey } from "./schedule.js";

/**
 * One scheduler pass: send any fixture whose kickoff has just passed and whose
 * picks have revealed, once each. Shared by the CLI (one-shot) and the worker
 * (loop). With { dry: true } it prints instead of posting.
 */
export async function runTick({ dry = false } = {}) {
  const now = new Date();
  const due = dueFixtures(now, loadSent(), {
    offsetMin: config.sendOffsetMinutes,
    windowMin: config.sendWindowMinutes,
  });

  if (due.length === 0) {
    console.log(`[${now.toISOString()}] nothing due.`);
    return;
  }

  console.log(
    `[${now.toISOString()}] ${due.length} fixture(s) due: ` +
      due.map((f) => `${f.home}-${f.away}`).join(", "),
  );

  await withSession(async (page) => {
    const leaderboard = await scrapeLeaderboard(page, config.poolId);

    for (const f of due) {
      const match = await findMatchPicks(page, config.poolId, f.game, f.home, f.away);

      // Predicted scores reveal at kickoff. Until then picks render as "?-?", so
      // we wait and retry on the next tick (eligible until the send window closes).
      if (!match || !picksRevealed(match)) {
        console.log(`  ${f.home}-${f.away}: picks not revealed yet — will retry.`);
        continue;
      }

      const message = formatUpdate({
        fixture: { home: f.homeName, away: f.awayName, competition: "World Cup Predictor" },
        picks: match.picks,
        standings: leaderboard,
        dashboardUrl: "https://www.superbru.com/player/dashboard.php",
      });

      if (dry) {
        console.log(`\n---- would send (${f.home}-${f.away}) ----\n`);
        console.log(message.replace(/<[^>]+>/g, ""));
      } else {
        const result = await sendMessage(message);
        markSent(fixtureKey(f), { messageId: result.message_id, match: `${f.home}-${f.away}` });
        console.log(`  ${f.home}-${f.away}: sent (message ${result.message_id}).`);
      }
    }
  });
}
