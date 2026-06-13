// Renders a sample message with mock data and (if a chat id is set) sends it.
// Lets you see/approve the format before the scraper exists.
import { formatUpdate } from "../format.js";
import { sendMessage } from "../telegram.js";

const sample = formatUpdate({
  fixture: {
    home: "England",
    away: "France",
    competition: "World Cup — Group Stage",
    kickoff: "Sat 14 Jun, 20:00",
  },
  picks: [
    { player: "Ted", prediction: "2-1" },
    { player: "Sam", prediction: "1-1" },
    { player: "Alex", prediction: "0-2" },
  ],
  standings: [
    { rank: 1, player: "Alex", points: 142 },
    { rank: 2, player: "Ted", points: 138 },
    { rank: 3, player: "Sam", points: 131 },
  ],
  dashboardUrl: "https://www.superbru.com/player/dashboard.php",
});

console.log("---- message preview ----\n");
console.log(sample.replace(/<[^>]+>/g, "")); // plain-text preview in terminal
console.log("\n-------------------------");

if (process.env.TELEGRAM_CHAT_ID && process.argv.includes("--send")) {
  const result = await sendMessage(sample);
  console.log(`\nSent preview message ${result.message_id} to your group.`);
} else {
  console.log("\nRun with --send (and TELEGRAM_CHAT_ID set) to post this to the group.");
}
