import { config } from "./config.js";
import {
  withSession,
  scrapeLeaderboard,
  findMatchPicks,
  picksRevealed,
  resultGraded,
} from "./superbru.js";
import { formatUpdate, formatResult } from "./format.js";
import { sendMessage } from "./telegram.js";
import { dueFixtures, loadSent, markSent, fixtureKey } from "./schedule.js";

const DASHBOARD_URL = "https://www.superbru.com/player/dashboard.php";

/**
 * One scheduler pass. Each fixture is announced twice, once each:
 *   - "predictions": at kickoff, once the picks reveal
 *   - "results":     after full time, once the match is scored — the final
 *                    score, how everyone fared, and the updated standings
 * With { dry: true } it prints instead of posting.
 */
export async function runTick({ dry = false } = {}) {
  const now = new Date();
  const due = dueFixtures(now, loadSent(), {
    offsetMin: config.sendOffsetMinutes,
    windowMin: config.sendWindowMinutes,
    resultOffsetMin: config.resultOffsetMinutes,
    resultWindowMin: config.resultWindowMinutes,
  });

  if (due.length === 0) {
    console.log(`[${now.toISOString()}] nothing due.`);
    return;
  }

  console.log(
    `[${now.toISOString()}] ${due.length} announcement(s) due: ` +
      due.map((f) => `${f.home}-${f.away} (${f.phase})`).join(", "),
  );

  await withSession(async (page) => {
    const leaderboard = await scrapeLeaderboard(page, config.poolId);

    for (const f of due) {
      const match = await findMatchPicks(page, config.poolId, f.game, f.home, f.away);
      const fixture = { home: f.homeName, away: f.awayName, competition: "World Cup Predictor" };

      let message;
      if (f.phase === "results") {
        // Wait until the match is over and scored (points filled in); retry on
        // the next tick until then (eligible until the result window closes).
        if (!match || !resultGraded(match)) {
          console.log(`  ${f.home}-${f.away}: result not in yet — will retry.`);
          continue;
        }
        message = formatResult({
          fixture,
          result: match.result,
          picks: match.picks,
          standings: leaderboard,
          dashboardUrl: DASHBOARD_URL,
        });
      } else {
        // Predicted scores reveal at kickoff. Until then picks render as "?-?",
        // so we wait and retry on the next tick (eligible until the window closes).
        if (!match || !picksRevealed(match)) {
          console.log(`  ${f.home}-${f.away}: picks not revealed yet — will retry.`);
          continue;
        }
        message = formatUpdate({
          fixture,
          picks: match.picks,
          standings: leaderboard,
          dashboardUrl: DASHBOARD_URL,
        });
      }

      if (dry) {
        console.log(`\n---- would send (${f.home}-${f.away}, ${f.phase}) ----\n`);
        console.log(message.replace(/<[^>]+>/g, ""));
      } else {
        const result = await sendMessage(message);
        markSent(fixtureKey(f, f.phase), {
          messageId: result.message_id,
          match: `${f.home}-${f.away}`,
          phase: f.phase,
        });
        console.log(`  ${f.home}-${f.away} (${f.phase}): sent (message ${result.message_id}).`);
      }
    }
  });
}
