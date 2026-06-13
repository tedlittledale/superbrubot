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
