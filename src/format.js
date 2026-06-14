import { escapeHtml } from "./telegram.js";

/**
 * Build the Telegram HTML message from scraped data.
 *
 * @param {Object} data
 * @param {Object} data.fixture        { home, away, kickoff, competition }
 * @param {Array}  data.picks          [{ player, prediction }]  (empty until deadline)
 * @param {Array}  data.standings      [{ rank, player, points }]
 * @param {string} [data.dashboardUrl] link back to Superbru
 */
export function formatUpdate({ fixture, picks = [], standings = [], dashboardUrl }) {
  const lines = [];

  lines.push(`⚽ <b>${escapeHtml(fixture.home)} v ${escapeHtml(fixture.away)}</b>`);
  if (fixture.competition) lines.push(escapeHtml(fixture.competition));
  if (fixture.kickoff) lines.push(`🕐 Kickoff: ${escapeHtml(fixture.kickoff)}`);
  lines.push("");

  if (picks.length > 0) {
    lines.push("<b>Predictions</b>");
    for (const p of picks) {
      lines.push(`• ${escapeHtml(p.player)}: <b>${escapeHtml(p.prediction)}</b>`);
    }
    lines.push("");
  }

  if (standings.length > 0) {
    lines.push("<b>Standings</b>");
    for (const s of standings) {
      lines.push(
        `${escapeHtml(String(s.rank))}. ${escapeHtml(s.player)} — ${escapeHtml(String(s.points))} pts`,
      );
    }
    lines.push("");
  }

  if (dashboardUrl) lines.push(`<a href="${escapeHtml(dashboardUrl)}">Open dashboard</a>`);

  return lines.join("\n").trim();
}

/** Pull the leading number out of a points string like "9 pts" → 9 (0 if none). */
function pointsValue(s) {
  const m = String(s || "").match(/-?\d+/);
  return m ? Number(m[0]) : 0;
}

/**
 * Build the end-of-game Telegram message: the final score, how each player
 * fared (their pick + points scored, best first), and the updated standings.
 *
 * @param {Object} data
 * @param {Object} data.fixture        { home, away, competition }
 * @param {string} [data.result]       actual final score, e.g. "2-1"
 * @param {Array}  data.picks          [{ player, prediction, points }]
 * @param {Array}  data.standings      [{ rank, player, points }]
 * @param {string} [data.dashboardUrl] link back to Superbru
 */
export function formatResult({ fixture, result, picks = [], standings = [], dashboardUrl }) {
  const lines = [];

  const heading = `🏁 <b>${escapeHtml(fixture.home)} v ${escapeHtml(fixture.away)}</b>`;
  lines.push(result ? `${heading} — FT ${escapeHtml(result)}` : `${heading} — full time`);
  if (fixture.competition) lines.push(escapeHtml(fixture.competition));
  lines.push("");

  if (picks.length > 0) {
    lines.push("<b>How everyone did</b>");
    const ranked = [...picks].sort((a, b) => pointsValue(b.points) - pointsValue(a.points));
    const best = ranked.length ? pointsValue(ranked[0].points) : 0;
    for (const p of ranked) {
      const pred = p.prediction ? `${escapeHtml(p.prediction)} — ` : "";
      const pts = p.points ? escapeHtml(p.points) : "—";
      const trophy = best > 0 && pointsValue(p.points) === best ? " 🏆" : "";
      lines.push(`• ${escapeHtml(p.player)}: ${pred}<b>${pts}</b>${trophy}`);
    }
    lines.push("");
  }

  if (standings.length > 0) {
    lines.push("<b>Standings</b>");
    for (const s of standings) {
      lines.push(
        `${escapeHtml(String(s.rank))}. ${escapeHtml(s.player)} — ${escapeHtml(String(s.points))} pts`,
      );
    }
    lines.push("");
  }

  if (dashboardUrl) lines.push(`<a href="${escapeHtml(dashboardUrl)}">Open dashboard</a>`);

  return lines.join("\n").trim();
}
