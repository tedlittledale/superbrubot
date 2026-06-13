// One-time calibration helper. Logs in with your .env credentials, then dumps
// the dashboard + results view (HTML, screenshots, and all nav links) into
// auth/ so the picks/standings selectors can be written against the real DOM.
//
//   1. Fill SUPERBRU_EMAIL / SUPERBRU_PASSWORD in .env
//   2. node src/cli/dumpDashboard.js
//
// Run with HEADED=1 to watch the browser: HEADED=1 node src/cli/dumpDashboard.js
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { withSession } from "../superbru.js";

const headless = process.env.HEADED !== "1";

async function capture(page, label) {
  const html = await page.content();
  writeFileSync(join(config.authDir, `${label}.html`), html);
  await page.screenshot({ path: join(config.authDir, `${label}.png`), fullPage: true });

  // All links on the page, to help locate standings / picks / pool pages.
  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")]
      .map((a) => ({ href: a.getAttribute("href"), text: a.innerText.trim().slice(0, 50) }))
      .filter((l) => l.text),
  );
  writeFileSync(join(config.authDir, `${label}-links.json`), JSON.stringify(links, null, 2));
  console.log(`Captured ${label}: ${html.length} bytes, ${links.length} links`);
}

await withSession(async (page) => {
  console.log(`Logged in. URL: ${page.url()}`);
  await capture(page, "dashboard");

  // Hash-based results tab.
  await page.goto(`${config.superbruPoolUrl}#tab=results`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await capture(page, "results");
}, { headless });

console.log("\nDone. Files written to auth/. Share what you're comfortable with, or");
console.log("just tell me and I'll read auth/results.html to write the selectors.");
