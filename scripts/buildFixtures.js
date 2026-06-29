// One-time generator: converts the public UK kick-off schedule into
// data/fixtures.json with unambiguous UTC times and Superbru team codes.
//
//   node scripts/buildFixtures.js
//
// Source: Sky Sports "UK kick-off times" list (single timezone = BST/UTC+1 for
// all World Cup dates). UTC is derived by tagging each time as +01:00.
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Full team name (as in the schedule) -> Superbru team code (as in the pool).
const CODE = {
  Mexico: "MEX", "South Africa": "RSA", "South Korea": "KOR",
  "Czech Republic": "CZE", Czechia: "CZE", Canada: "CAN",
  "Bosnia & Herzegovina": "BHI", "Bosnia and Herzegovina": "BHI",
  "Bosnia-Herzegovina": "BHI",
  USA: "USA", "United States": "USA", Paraguay: "PAR", Qatar: "QAT", Switzerland: "SUI",
  Brazil: "BRA", Morocco: "MOR", Haiti: "HAI", Scotland: "SCO",
  Australia: "AUS", Turkey: "TUR", Turkiye: "TUR", Germany: "GER",
  Curacao: "CUR", Netherlands: "NED", Japan: "JPN", "Ivory Coast": "CIV",
  Ecuador: "ECU", Sweden: "SWE", Tunisia: "TUN", Spain: "ESP",
  "Cape Verde": "CPV", Belgium: "BEL", Egypt: "EGY", "Saudi Arabia": "KSA",
  Uruguay: "URU", Iran: "IRN", "New Zealand": "NZL", France: "FRA",
  Senegal: "SEN", Iraq: "IRQ", Norway: "NOR", Argentina: "ARG",
  Algeria: "ALG", Austria: "AUT", Jordan: "JOR", Portugal: "POR",
  "DR Congo": "DRC", England: "ENG", Croatia: "CRO", Ghana: "GHA",
  Panama: "PAN", Uzbekistan: "UZB", Colombia: "COL",
};

// "YYYY-MM-DD | HH:MM | TeamA vs TeamB" — UK (BST) kick-off times.
// TBD / already-played openers are kept for completeness; the scheduler ignores
// anything in the past.
const SCHEDULE = `
2026-06-13 | 20:00 | Qatar vs Switzerland
2026-06-13 | 23:00 | Brazil vs Morocco
2026-06-14 | 02:00 | Haiti vs Scotland
2026-06-14 | 05:00 | Australia vs Turkey
2026-06-14 | 18:00 | Germany vs Curacao
2026-06-14 | 21:00 | Netherlands vs Japan
2026-06-15 | 00:00 | Ivory Coast vs Ecuador
2026-06-15 | 03:00 | Sweden vs Tunisia
2026-06-15 | 17:00 | Spain vs Cape Verde
2026-06-15 | 20:00 | Belgium vs Egypt
2026-06-15 | 23:00 | Saudi Arabia vs Uruguay
2026-06-16 | 02:00 | Iran vs New Zealand
2026-06-16 | 20:00 | France vs Senegal
2026-06-16 | 23:00 | Iraq vs Norway
2026-06-17 | 02:00 | Argentina vs Algeria
2026-06-17 | 05:00 | Austria vs Jordan
2026-06-17 | 18:00 | Portugal vs DR Congo
2026-06-17 | 21:00 | England vs Croatia
2026-06-18 | 00:00 | Ghana vs Panama
2026-06-18 | 03:00 | Uzbekistan vs Colombia
2026-06-18 | 17:00 | Czech Republic vs South Africa
2026-06-18 | 20:00 | Switzerland vs Bosnia & Herzegovina
2026-06-18 | 23:00 | Canada vs Qatar
2026-06-19 | 02:00 | Mexico vs South Korea
2026-06-19 | 20:00 | USA vs Australia
2026-06-19 | 23:00 | Scotland vs Morocco
2026-06-20 | 01:30 | Brazil vs Haiti
2026-06-20 | 04:00 | Turkey vs Paraguay
2026-06-20 | 18:00 | Netherlands vs Sweden
2026-06-20 | 21:00 | Germany vs Ivory Coast
2026-06-21 | 01:00 | Ecuador vs Curacao
2026-06-21 | 05:00 | Tunisia vs Japan
2026-06-21 | 17:00 | Spain vs Saudi Arabia
2026-06-21 | 20:00 | Belgium vs Iran
2026-06-21 | 23:00 | Uruguay vs Cape Verde
2026-06-22 | 02:00 | New Zealand vs Egypt
2026-06-22 | 18:00 | Argentina vs Austria
2026-06-22 | 22:00 | France vs Iraq
2026-06-23 | 01:00 | Norway vs Senegal
2026-06-23 | 04:00 | Jordan vs Algeria
2026-06-23 | 18:00 | Portugal vs Uzbekistan
2026-06-23 | 21:00 | England vs Ghana
2026-06-24 | 00:00 | Panama vs Croatia
2026-06-24 | 03:00 | Colombia vs DR Congo
2026-06-24 | 20:00 | Switzerland vs Canada
2026-06-24 | 20:00 | Bosnia & Herzegovina vs Qatar
2026-06-24 | 23:00 | Morocco vs Haiti
2026-06-24 | 23:00 | Scotland vs Brazil
2026-06-25 | 02:00 | South Africa vs South Korea
2026-06-25 | 02:00 | Czech Republic vs Mexico
2026-06-25 | 21:00 | Curacao vs Ivory Coast
2026-06-25 | 21:00 | Ecuador vs Germany
2026-06-26 | 00:00 | Tunisia vs Netherlands
2026-06-26 | 00:00 | Japan vs Sweden
2026-06-26 | 03:00 | Turkey vs USA
2026-06-26 | 03:00 | Paraguay vs Australia
2026-06-26 | 20:00 | Norway vs France
2026-06-26 | 20:00 | Senegal vs Iraq
2026-06-27 | 01:00 | Cape Verde vs Saudi Arabia
2026-06-27 | 01:00 | Uruguay vs Spain
2026-06-27 | 04:00 | New Zealand vs Belgium
2026-06-27 | 04:00 | Egypt vs Iran
2026-06-27 | 22:00 | Panama vs England
2026-06-27 | 22:00 | Croatia vs Ghana
2026-06-28 | 20:00 | South Africa vs Canada
2026-06-29 | 18:00 | Brazil vs Japan
2026-06-29 | 21:30 | Germany vs Paraguay
2026-06-30 | 02:00 | Netherlands vs Morocco
2026-06-30 | 18:00 | Ivory Coast vs Norway
2026-06-30 | 22:00 | France vs Sweden
2026-07-01 | 02:00 | Mexico vs Ecuador
2026-07-01 | 17:00 | England vs DR Congo
2026-07-01 | 21:00 | Belgium vs Senegal
2026-07-02 | 01:00 | United States vs Bosnia-Herzegovina
2026-07-02 | 20:00 | Spain vs Austria
2026-07-03 | 00:00 | Portugal vs Croatia
2026-07-03 | 04:00 | Switzerland vs Algeria
2026-07-03 | 19:00 | Australia vs Egypt
2026-07-03 | 23:00 | Argentina vs Cape Verde
2026-07-04 | 02:30 | Colombia vs Ghana
`.trim();

const code = (name) => {
  const c = CODE[name.trim()];
  if (!c) throw new Error(`No Superbru code mapped for team "${name}"`);
  return c;
};

// Superbru numbers matches globally in kickoff order (pool_view `g` param).
// The first fixture in this list (Qatar v Switzerland) is confirmed as g=5.
const START_GAME = 5;

const fixtures = SCHEDULE.split("\n").map((line, i) => {
  const [date, time, teams] = line.split("|").map((s) => s.trim());
  const [home, away] = teams.split(" vs ");
  // Tag the UK time as BST (+01:00) → toISOString() yields the true UTC instant.
  const kickoffUtc = new Date(`${date}T${time}:00+01:00`).toISOString();
  // `game` is the best-guess match number; the scraper confirms by team code
  // and self-corrects, so exact ordering of simultaneous kickoffs is harmless.
  return {
    game: START_GAME + i,
    home: code(home),
    away: code(away),
    homeName: home,
    awayName: away,
    kickoffUtc,
  };
});

mkdirSync(join(root, "data"), { recursive: true });
writeFileSync(join(root, "data", "fixtures.json"), JSON.stringify(fixtures, null, 2));
console.log(`Wrote ${fixtures.length} fixtures to data/fixtures.json`);
console.log("First 3:", fixtures.slice(0, 3));
