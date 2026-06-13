// Scrapes the pool and prints structured data. Phase 2 verification.
//   node src/cli/scrape.js [poolId] [game]
import { withSession, scrapeLeaderboard, scrapeRoundPicks } from "../superbru.js";

const poolId = process.argv[2] || "13208945";
const game = process.argv[3] || "4";

await withSession(async (page) => {
  const leaderboard = await scrapeLeaderboard(page, poolId);
  const matches = await scrapeRoundPicks(page, poolId, game);
  console.log(JSON.stringify({ leaderboard, matches }, null, 2));
});
