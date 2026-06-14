// End-to-end deploy check. Sends a Telegram ping, and (if given a match number)
// a real update for that match — without waiting for a live kickoff.
//
//   node src/cli/selftest.js        # Telegram ping only
//   node src/cli/selftest.js 5      # ping + real Qatar-Switzerland update
import { selfTest } from "../selftest.js";

await selfTest(process.argv[2] || process.env.SELFTEST || "");
