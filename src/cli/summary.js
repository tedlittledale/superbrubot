// Build (and optionally post) the end-of-day summary for a given day on demand.
// Useful to (re)generate a day the worker missed or got wrong.
//
//   npm run summary                      # yesterday (in SUMMARY_TZ), dry run
//   npm run summary 2026-06-15           # a specific US calendar day, dry run
//   npm run summary 2026-06-15 --send    # ...and post it to the Telegram group
//
// Needs the same .env as the worker (Superbru + Telegram). The day is bucketed
// by SUMMARY_TZ (Pacific by default), matching the worker's grouping.
import { config } from "../config.js";
import { withSession, scrapeLeaderboard, findMatchPicks } from "../superbru.js";
import { formatDailySummary, pointsValue } from "../format.js";
import { sendMessage } from "../telegram.js";
import { loadFixtures, dayKeyOf } from "../schedule.js";

const DASHBOARD_URL = "https://www.superbru.com/player/dashboard.php";
const tz = config.summaryTz;

const arg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;
const send = process.argv.includes("--send");

/** Yesterday's date (YYYY-MM-DD) in the summary timezone. */
function yesterdayKey() {
  const d = new Date(`${dayKeyOf(new Date(), tz)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const day = arg || yesterdayKey();
const fixtures = loadFixtures()
  .filter((f) => dayKeyOf(f.kickoffUtc, tz) === day)
  .sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));

if (fixtures.length === 0) {
  console.error(`No fixtures found for ${day} (${tz}).`);
  process.exit(1);
}

const { standings, dailyPoints } = await withSession(async (page) => {
  const standings = await scrapeLeaderboard(page, config.poolId);
  const dailyPoints = {};
  for (const f of fixtures) {
    const m = await findMatchPicks(page, config.poolId, f.game, f.home, f.away);
    for (const p of m?.picks || []) {
      dailyPoints[p.player] = (dailyPoints[p.player] || 0) + pointsValue(p.points);
    }
  }
  return { standings, dailyPoints };
});

const message = formatDailySummary({ day, dailyPoints, standings, dashboardUrl: DASHBOARD_URL });

if (send) {
  const r = await sendMessage(message);
  console.log(`Sent daily summary for ${day} (message ${r.message_id}).`);
} else {
  console.log(`---- daily summary ${day} (${fixtures.length} matches; add --send to post) ----\n`);
  console.log(message.replace(/<[^>]+>/g, ""));
}
