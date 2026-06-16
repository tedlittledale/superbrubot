import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

const FIXTURES = join(config.root, "data", "fixtures.json");
const SENT = config.sentPath;

export function loadFixtures() {
  return JSON.parse(readFileSync(FIXTURES, "utf8"));
}

/**
 * A stable key for a fixture announcement, used to record that it has been sent.
 * Each fixture has two phases: "predictions" (at kickoff) and "results" (after
 * full time). The predictions key keeps its original shape for backward
 * compatibility with any existing sent.json.
 */
export function fixtureKey(f, phase = "predictions") {
  const base = `${f.kickoffUtc}_${f.home}_${f.away}`;
  return phase === "results" ? `${base}_result` : base;
}

/** The US calendar day (YYYY-MM-DD, in `tz`) a kickoff belongs to. */
export function dayKeyOf(kickoffUtc, tz) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(kickoffUtc));
}

/** Stable key recording that a given day's end-of-day summary has been sent. */
export function summaryKey(dayKey) {
  return `daily_${dayKey}`;
}

/**
 * Days whose end-of-day summary should be sent now: every fixture that day has
 * already had its "results" announcement posted (results only post after full
 * time, so this means the day is complete) and we haven't sent the summary yet.
 * Fixtures are bucketed by their US calendar day in `tz`. A `settleMs` grace
 * period after the day's last result keeps the summary from reading the final
 * standings before Superbru has settled them. Returns [{ day, fixtures }] with
 * fixtures sorted by kickoff.
 */
export function dueDailySummaries(sent, { tz = "America/Los_Angeles", now = new Date(), settleMs = 0 } = {}) {
  const byDay = new Map();
  for (const f of loadFixtures()) {
    const day = dayKeyOf(f.kickoffUtc, tz);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(f);
  }

  const due = [];
  for (const [day, fixtures] of byDay) {
    if (sent[summaryKey(day)]) continue;
    const records = fixtures.map((f) => sent[fixtureKey(f, "results")]);
    if (!records.every(Boolean)) continue;
    if (settleMs > 0) {
      const lastResultAt = Math.max(...records.map((r) => new Date(r.at).getTime() || 0));
      if (now.getTime() - lastResultAt < settleMs) continue;
    }
    fixtures.sort((a, b) => new Date(a.kickoffUtc) - new Date(b.kickoffUtc));
    due.push({ day, fixtures });
  }
  return due;
}

export function loadSent() {
  if (!existsSync(SENT)) return {};
  return JSON.parse(readFileSync(SENT, "utf8"));
}

export function markSent(key, info) {
  mkdirSync(config.stateDir, { recursive: true });
  const sent = loadSent();
  sent[key] = { ...info, at: new Date().toISOString() };
  writeFileSync(SENT, JSON.stringify(sent, null, 2));
}

/**
 * Fixture announcements that should fire now, each tagged with its `phase`:
 *   - "predictions": kickoff + offset has passed (picks reveal at kickoff)
 *   - "results":     kickoff + resultOffset has passed (match should be over)
 * An announcement is due when its send time has passed, we're still within its
 * window, and we haven't already sent that phase for that fixture. A fixture can
 * appear twice (once per phase) if both are eligible at the same time.
 *
 * @param now             Date
 * @param sent            object from loadSent()
 * @param offsetMin       minutes after kickoff to post predictions (0 = at kickoff)
 * @param windowMin       how long the predictions phase stays eligible
 * @param resultOffsetMin minutes after kickoff to start checking for the result
 * @param resultWindowMin how long the results phase stays eligible
 */
export function dueFixtures(
  now,
  sent,
  { offsetMin = 0, windowMin = 120, resultOffsetMin = 110, resultWindowMin = 240 } = {},
) {
  const within = (kickoffMs, offMin, winMin) => {
    const ms = now.getTime() - (kickoffMs + offMin * 60_000);
    return ms >= 0 && ms <= winMin * 60_000;
  };

  const due = [];
  for (const f of loadFixtures()) {
    const kickoffMs = new Date(f.kickoffUtc).getTime();
    if (!sent[fixtureKey(f, "predictions")] && within(kickoffMs, offsetMin, windowMin)) {
      due.push({ ...f, phase: "predictions" });
    }
    if (!sent[fixtureKey(f, "results")] && within(kickoffMs, resultOffsetMin, resultWindowMin)) {
      due.push({ ...f, phase: "results" });
    }
  }
  return due;
}
