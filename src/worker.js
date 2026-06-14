// Always-on worker for Railway (or any host). Runs the tick on a fixed
// interval forever; one failed pass is logged and the loop continues.
import { runTick } from "./runTick.js";
import { selfTest } from "./selftest.js";

const INTERVAL_MS = Number(process.env.TICK_INTERVAL_SECONDS || 60) * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Superbru worker started — ticking every ${INTERVAL_MS / 1000}s.`);

// Set SELFTEST (e.g. SELFTEST=5) to verify the deploy on boot, then unset it.
if (process.env.SELFTEST) {
  try {
    await selfTest(process.env.SELFTEST);
  } catch (err) {
    console.error("selftest failed:", err.message);
  }
}

// eslint-disable-next-line no-constant-condition
while (true) {
  try {
    await runTick();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] tick failed:`, err.message);
  }
  await sleep(INTERVAL_MS);
}
