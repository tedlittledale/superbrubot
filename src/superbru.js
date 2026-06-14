import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

const STATE_PATH = join(config.authDir, "state.json");
const LOGIN_URL = "https://www.superbru.com/login";

/**
 * Dismiss the cookie-consent banner if present. On a fresh container the
 * Quantcast CMP (#qc-cmp2-container) overlays the page and intercepts clicks,
 * so this must succeed before any form interaction. We try, in order: the
 * Quantcast "AGREE" button, a known inline button, and any consent-style
 * button by name across the main frame and iframes — then wait for the overlay
 * to actually disappear.
 */
export async function acceptCookies(page) {
  const tryClick = async (locator) => {
    try {
      if (await locator.first().isVisible({ timeout: 1500 })) {
        await locator.first().click({ timeout: 3000 });
        return true;
      }
    } catch {
      /* not here — keep looking */
    }
    return false;
  };

  const byName = (root) =>
    root.getByRole("button", { name: /^(agree|i agree|accept all|accept|consent|got it)/i });

  let clicked =
    // Quantcast Choice CMP — the primary "AGREE" button.
    (await tryClick(page.locator('.qc-cmp2-summary-buttons button[mode="primary"]'))) ||
    (await tryClick(page.locator("#qc-cmp2-ui button").filter({ hasText: /agree|accept/i }))) ||
    // The simpler inline banner.
    (await tryClick(page.locator("#accept-btn"))) ||
    // Generic, by accessible name.
    (await tryClick(byName(page)));
  if (!clicked) {
    for (const frame of page.frames()) {
      if (await tryClick(byName(frame))) {
        clicked = true;
        break;
      }
    }
  }

  // Wait for the consent overlay to hide so it no longer intercepts clicks
  // (Quantcast leaves the container in the DOM but sets it hidden).
  await page
    .locator("#qc-cmp2-container")
    .waitFor({ state: "hidden", timeout: 5000 })
    .catch(() => {});

  // Last resort: on fresh containers the AGREE button is sometimes absent or
  // buried in an iframe we can't click, so the overlay never goes away and
  // intercepts the login click ("#qc-cmp2-container intercepts pointer events").
  // If it's still in the way, strip the consent nodes out of the DOM and restore
  // scrolling so the form underneath is clickable.
  const stillBlocking = await page
    .locator("#qc-cmp2-container")
    .isVisible()
    .catch(() => false);
  if (stillBlocking) {
    await page.evaluate(() => {
      document
        .querySelectorAll('#qc-cmp2-container, #qc-cmp2-ui, [class^="qc-cmp2"]')
        .forEach((el) => el.remove());
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    });
    clicked = true;
  }
  return clicked;
}

/** Log in via the Superbru tab and return once the dashboard has loaded. */
async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  await acceptCookies(page);

  await page.fill("#email-superbru", config.superbruEmail);
  await page.fill("#password-superbru", config.superbruPassword);
  // (We don't touch "remember me" — the session is persisted via storageState,
  // and the checkbox sits under the consent overlay on fresh containers.)

  // Consent can render late; make sure it's gone before the submit click.
  await acceptCookies(page);

  // The Superbru submit button is the one whose form holds #password-superbru.
  const form = page.locator("#password-superbru").locator("xpath=ancestor::form");
  const submit = form.getByRole("button", { name: "Log in", exact: true });
  const settle = async () => {
    // Wait for the redirect into the logged-in area to settle before verifying,
    // so the verify step doesn't race the in-flight navigation (ERR_ABORTED).
    await page.waitForURL(/\/player\//, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
  };

  try {
    await submit.click({ timeout: 10000 });
  } catch {
    // If something is still intercepting the click, dispatch it straight to the
    // button (bypasses overlay hit-testing) rather than timing out for 30s.
    await submit.click({ force: true });
  }
  await settle();

  // Fallback: if the button click didn't move us off /login, the site's submit
  // handler may only fire on a real Enter-press in the password field. Try that
  // before giving up (harmless if we've already navigated away).
  if (page.url().includes("/login")) {
    await page.locator("#password-superbru").press("Enter").catch(() => {});
    await settle();
  }

  // Capture the post-submit state NOW, before the verify step re-navigates and
  // wipes any inline credentials error off the login page.
  const postSubmit = await loginDiagnostics(page);

  if (!(await isLoggedIn(page))) {
    throw new Error(`Login failed — ${postSubmit}`);
  }
}

/**
 * Best-effort explanation of why a login didn't take, for the error message.
 * Superbru shows wrong credentials as an inline error on the same page, so we
 * surface that text if present; otherwise we report where we ended up (URL +
 * whether the login form is still on screen) so the failure is debuggable from
 * Telegram without server access.
 */
async function loginDiagnostics(page) {
  try {
    return await page.evaluate(() => {
      const text = (sel) =>
        [...document.querySelectorAll(sel)]
          .map((e) => (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim())
          .find((t) => t.length > 0) || "";
      // Common spots Superbru renders a sign-in error.
      const err =
        text(".alert-danger, .error, .form-error, .login-error, [role='alert']") ||
        ([...document.querySelectorAll("*")]
          .map((e) => (e.childElementCount ? "" : (e.innerText || "").trim()))
          .find((t) => /incorrect|invalid|wrong|try again|doesn't match|does not match/i.test(t)) ||
          "");
      const formStillShown = !!document.querySelector("#password-superbru");
      const here = location.href.replace(/^https?:\/\/(www\.)?superbru\.com/, "");
      if (err) return `Superbru says: "${err.slice(0, 200)}" (at ${here})`;
      return formStillShown
        ? `still on the login form (at ${here}) — submit didn't establish a session.`
        : `ended at ${here} but not detected as logged in. Check SUPERBRU_EMAIL/PASSWORD.`;
    });
  } catch {
    return "still seeing a logged-out page. Check SUPERBRU_EMAIL/PASSWORD in .env.";
  }
}

/**
 * True if the current page is in a logged-in state. Superbru serves a PUBLIC
 * marketing version of dashboard.php when logged out (no redirect to /login),
 * so we detect auth by content: a logged-out page shows "Create Account" /
 * "Log in" links; a logged-in page exposes a logout link instead.
 */
async function isLoggedIn(page) {
  if (!page.url().includes("/player/")) {
    // Tolerate an ERR_ABORTED if a prior navigation is still in flight.
    try {
      await page.goto(config.superbruPoolUrl, { waitUntil: "domcontentloaded" });
    } catch {
      await page.waitForTimeout(1000);
      await page.goto(config.superbruPoolUrl, { waitUntil: "domcontentloaded" });
    }
  }
  return page.evaluate(() => {
    const hrefs = [...document.querySelectorAll("a[href]")].map((a) =>
      (a.getAttribute("href") || "").toLowerCase(),
    );
    const loggedOut = hrefs.some(
      (h) => h.includes("register.php") || h === "/login" || h.includes("/sign-up"),
    );
    const loggedIn = hrefs.some((h) => h.includes("logout"));
    return loggedIn || !loggedOut;
  });
}

const POOL_BASE = "https://www.superbru.com/worldcup_predictor";
// Tournament id for the World Cup Predictor, taken from the pool_view links.
const TOURNAMENT = 1296;

/** Scrape the pool standings → [{ rank, player, points }]. */
export async function scrapeLeaderboard(page, poolId) {
  await page.goto(`${POOL_BASE}/pool.php?p=${poolId}&tab=leaderboard#tab=leaderboard`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    const table = document.querySelector("table.mobile-leaderboard");
    if (!table) return [];
    return [...table.querySelectorAll("tbody tr")]
      .filter((tr) => tr.querySelector(".user-name"))
      .map((tr) => {
        const cells = tr.querySelectorAll("td");
        return {
          rank: tr.querySelector(".rank")?.innerText.trim() || "",
          player: tr.querySelector(".user-name")?.innerText.trim() || "",
          points: cells[cells.length - 1]?.innerText.trim() || "",
        };
      });
  });
}

/**
 * Scrape every revealed match in a round → [{ home, away, score, picks: [...] }].
 * `game` is the round's internal id (the `g` param). Picks are only present for
 * matches whose deadline has passed.
 */
export async function scrapeRoundPicks(page, poolId, game) {
  await page.goto(
    `${POOL_BASE}/pool_view.php?t=${TOURNAMENT}&p=${poolId}&g=${game}&view=matches`,
    { waitUntil: "networkidle" },
  );
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    // Each revealed match renders a block: a fixture header + a picks table.
    // We pair each picks table with the nearest preceding fixture label.
    const readPick = (tr) => {
      const player = tr.querySelector(".app-user-name")?.innerText.trim();
      if (!player) return null;
      const pickCell = tr.querySelector(".td-pick");
      const codes = [...(pickCell?.querySelectorAll(".team-code") || [])].map((e) =>
        e.innerText.trim(),
      );
      const pts = [...(pickCell?.querySelectorAll(".score .pts") || [])].map((e) =>
        e.innerText.trim(),
      );
      const prediction =
        codes.length === 2 && pts.length === 2
          ? `${codes[0]} ${pts[0]}-${pts[1]} ${codes[1]}`
          : (pickCell?.innerText || "").replace(/\s+/g, " ").trim();
      return {
        player,
        prediction,
        points: tr.querySelector(".td-points")?.innerText.trim().replace(/\s+/g, " ") || "",
      };
    };

    // Best-effort: pull the actual final score for a match from the fixture
    // header near its picks table. Once played, Superbru shows it as e.g.
    // "2 - 1"; before that there's nothing to find, so we return null and the
    // message just omits the score line.
    const findResult = (table) => {
      let node = table;
      for (let i = 0; i < 5 && node?.parentElement; i++) {
        node = node.parentElement;
        const el = node.querySelector(
          ".result, .match-result, .fixture-result, .final-score, .score-result, .actual-result",
        );
        const txt = (el?.innerText || "").replace(/\s+/g, " ").trim();
        const m = txt.match(/(\d+)\s*[-–:]\s*(\d+)/);
        if (m) return `${m[1]}-${m[2]}`;
      }
      return null;
    };

    const matches = [...document.querySelectorAll("table")]
      .filter((t) => t.querySelector(".td-pick"))
      .map((table) => {
        const picks = [...table.querySelectorAll("tr")].map(readPick).filter(Boolean);
        // The fixture this table belongs to: the first pick row's team codes.
        const firstPickCell = table.querySelector(".td-pick");
        const codes = [...(firstPickCell?.querySelectorAll(".team-code") || [])].map((e) =>
          e.innerText.trim(),
        );
        return { home: codes[0] || "", away: codes[1] || "", result: findResult(table), picks };
      })
      .filter((m) => m.picks.length);

    // The page renders responsive (desktop + mobile) copies of each table —
    // dedupe by fixture + pick count so each match appears once.
    const seen = new Set();
    return matches.filter((m) => {
      const key = `${m.home}-${m.away}-${m.picks.length}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
}

const isSameFixture = (m, home, away) =>
  (m.home === home && m.away === away) || (m.home === away && m.away === home);

/** A pick whose score is still hidden renders as "?-?" before the deadline. */
export function picksRevealed(match) {
  return match.picks.length > 0 && match.picks.some((p) => !p.prediction.includes("?"));
}

/**
 * True once the match is over and scored: Superbru fills in each pick's points
 * column (e.g. "9 pts") only after grading, so a points value containing a
 * digit on any pick means the result is in. (Before that the column is blank.)
 */
export function resultGraded(match) {
  return match.picks.length > 0 && match.picks.some((p) => /\d/.test(p.points || ""));
}

/**
 * Find a specific match's picks by team code. `game` is the best-guess match
 * number (pool_view `g`); we confirm by team code and probe nearby numbers to
 * self-correct any drift (e.g. simultaneous kickoffs numbered in a different
 * order than our schedule). Returns the match (possibly with hidden "?-?"
 * picks if the deadline hasn't passed) or null if it can't be located.
 */
export async function findMatchPicks(page, poolId, game, home, away) {
  const base = Number(game);
  // Search outward from the best guess: base, base±1, base±2, base±3.
  const candidates = [base, base + 1, base - 1, base + 2, base - 2, base + 3, base - 3];
  for (const g of candidates) {
    if (g < 1) continue;
    const matches = await scrapeRoundPicks(page, poolId, String(g));
    const hit = matches.find((m) => isSameFixture(m, home, away));
    if (hit) return hit;
  }
  return null;
}

/**
 * Run `fn(page)` with an authenticated page. Reuses a saved session when
 * possible, otherwise logs in fresh and saves the session for next time.
 */
export async function withSession(fn, { headless = true } = {}) {
  mkdirSync(config.authDir, { recursive: true });
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext(
      existsSync(STATE_PATH) ? { storageState: STATE_PATH } : {},
    );
    const page = await context.newPage();

    if (!(await isLoggedIn(page))) {
      await login(page);
    }

    // Accept the cookie banner once on the dashboard (where it behaves), then
    // persist the session — the consent cookie stops the modal reappearing on
    // pool pages, where clicking it knocks us out of the pool context.
    await acceptCookies(page);
    await context.storageState({ path: STATE_PATH });

    return await fn(page);
  } finally {
    await browser.close();
  }
}
