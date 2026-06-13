// One-shot scheduler tick (for cron, or manual testing).
//   node src/cli/tick.js           # live: scrapes + sends due fixtures
//   node src/cli/tick.js --dry     # prints what it would send, no posting
import { runTick } from "../runTick.js";

await runTick({ dry: process.argv.includes("--dry") });
