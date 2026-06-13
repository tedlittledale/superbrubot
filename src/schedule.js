import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

const FIXTURES = join(config.root, "data", "fixtures.json");
const SENT = config.sentPath;

export function loadFixtures() {
  return JSON.parse(readFileSync(FIXTURES, "utf8"));
}

/** A stable key for a fixture, used to record that it has been announced. */
export function fixtureKey(f) {
  return `${f.kickoffUtc}_${f.home}_${f.away}`;
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
 * Fixtures that should be announced now: kickoff + offset has passed, we're
 * still within the send window, and we haven't already sent them.
 *
 * @param now       Date
 * @param sent      object from loadSent()
 * @param offsetMin minutes after kickoff to send (0 = at kickoff/deadline)
 * @param windowMin how long after the send time a fixture stays eligible
 */
export function dueFixtures(now, sent, { offsetMin = 0, windowMin = 120 } = {}) {
  return loadFixtures().filter((f) => {
    if (sent[fixtureKey(f)]) return false;
    const sendAt = new Date(f.kickoffUtc).getTime() + offsetMin * 60_000;
    const ms = now.getTime() - sendAt;
    return ms >= 0 && ms <= windowMin * 60_000;
  });
}
