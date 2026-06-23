import { config } from "./config.js";
import {
  withSession,
  scrapeLeaderboard,
  findMatchPicks,
  picksRevealed,
  resultGraded,
  matchIsLive,
  parsePoints,
} from "./superbru.js";
import { formatUpdate, formatResult, formatDailySummary } from "./format.js";
import { sendMessage } from "./telegram.js";
import {
  dueFixtures,
  dueDailySummaries,
  loadSent,
  markSent,
  fixtureKey,
  summaryKey,
} from "./schedule.js";

const DASHBOARD_URL = "https://www.superbru.com/player/dashboard.php";

/**
 * One scheduler pass. Each fixture is announced twice, once each:
 *   - "predictions": at kickoff, once the picks reveal
 *   - "results":     after full time, once the match is scored — the final
 *                    score, how everyone fared, and the updated standings
 * Then, once every match on a US calendar day has had its result posted, an
 * end-of-day summary of the points everyone gained that day.
 *
 * Standings come from Superbru's own leaderboard total (it includes bonus points
 * that a per-match sum can't see). With { dry: true } it prints instead of posting.
 */
export async function runTick({ dry = false } = {}) {
  const now = new Date();
  const due = dueFixtures(now, loadSent(), {
    offsetMin: config.sendOffsetMinutes,
    windowMin: config.sendWindowMinutes,
    resultOffsetMin: config.resultOffsetMinutes,
    resultWindowMin: config.resultWindowMinutes,
  });
  const summaryOpts = {
    tz: config.summaryTz,
    now,
    settleMs: config.summarySettleMinutes * 60_000,
  };
  const summariesDue = config.dailySummaryEnabled ? dueDailySummaries(loadSent(), summaryOpts) : [];

  if (due.length === 0 && summariesDue.length === 0) {
    console.log(`[${now.toISOString()}] nothing due.`);
    return;
  }

  console.log(
    `[${now.toISOString()}] ${due.length} announcement(s) + ${summariesDue.length} summary(ies) due: ` +
      due.map((f) => `${f.home}-${f.away} (${f.phase})`).join(", "),
  );

  await withSession(async (page) => {
    // Standings are read once per tick, lazily — only when something is actually
    // being sent (retry ticks that bail out early don't pay for it).
    let standings;
    const getStandings = async () => (standings ||= await scrapeLeaderboard(page, config.poolId));

    for (const f of due) {
      const match = await findMatchPicks(page, config.poolId, f.game, f.home, f.away);
      const fixture = { home: f.homeName, away: f.awayName, competition: "World Cup Predictor" };

      let message;
      if (f.phase === "results") {
        // Only post once the match has actually FINISHED and been scored. Points
        // appear live (resultGraded goes true mid-game), so we also require the
        // match not to be live — otherwise the score and standings are still
        // provisional. Retry on the next tick until then (eligible until the
        // result window closes).
        if (!match || !resultGraded(match) || matchIsLive(match)) {
          console.log(
            `  ${f.home}-${f.away}: result not final yet ` +
              `(graded=${!!match && resultGraded(match)}, status="${match?.status || ""}") — will retry.`,
          );
          continue;
        }
        message = formatResult({
          fixture,
          result: match.result,
          picks: match.picks,
          standings: await getStandings(),
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
          standings: await getStandings(),
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

    // End-of-day summaries. Recompute from fresh sent state so a result posted in
    // the loop above can trigger its day's summary in this same tick.
    if (config.dailySummaryEnabled) {
      const sent = loadSent();
      for (const { day, fixtures } of dueDailySummaries(sent, summaryOpts)) {
        // Re-scrape fresh at summary time. Standings come from Superbru's total;
        // the day's points are summed from each match's pick points.
        const summaryStandings = await getStandings();
        const dailyPoints = {};
        for (const f of fixtures) {
          const m = await findMatchPicks(page, config.poolId, f.game, f.home, f.away);
          for (const p of m?.picks || []) {
            dailyPoints[p.player] = (dailyPoints[p.player] || 0) + parsePoints(p.points);
          }
        }

        const message = formatDailySummary({
          day,
          dailyPoints,
          standings: summaryStandings,
          dashboardUrl: DASHBOARD_URL,
        });

        if (dry) {
          console.log(`\n---- would send (daily summary ${day}) ----\n`);
          console.log(message.replace(/<[^>]+>/g, ""));
        } else {
          const result = await sendMessage(message);
          markSent(summaryKey(day), { messageId: result.message_id, day, kind: "daily" });
          console.log(`  daily summary ${day}: sent (message ${result.message_id}).`);
        }
      }
    }
  });
}
