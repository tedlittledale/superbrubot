// Main entry: scrape the pool, format the update, send it to Telegram.
//   node src/index.js [poolId] [game] [--send]
//
// Without --send it prints the message (dry run). With --send it posts to the
// configured Telegram group. The scheduler (Phase 3) calls this with --send at
// each fixture deadline.
import { config } from "./config.js";
import { withSession, scrapeLeaderboard, scrapeRoundPicks } from "./superbru.js";
import { formatUpdate } from "./format.js";
import { sendMessage } from "./telegram.js";

const poolId = process.argv[2] || "13208945";
const game = process.argv[3] || "4";
const send = process.argv.includes("--send");

const { leaderboard, match } = await withSession(async (page) => {
  const leaderboard = await scrapeLeaderboard(page, poolId);
  const matches = await scrapeRoundPicks(page, poolId, game);
  // The most-recently-unlocked match is the one whose deadline just passed.
  const match = matches[matches.length - 1] || null;
  return { leaderboard, match };
});

if (!match) {
  console.error("No revealed match found — nothing to announce yet.");
  process.exit(0);
}

const message = formatUpdate({
  fixture: { home: match.home, away: match.away, competition: "World Cup Predictor" },
  picks: match.picks,
  standings: leaderboard,
  dashboardUrl: "https://www.superbru.com/player/dashboard.php",
});

if (send) {
  const result = await sendMessage(message);
  console.log(`Sent message ${result.message_id} to the group.`);
} else {
  console.log("---- DRY RUN (use --send to post) ----\n");
  console.log(message.replace(/<[^>]+>/g, ""));
}
