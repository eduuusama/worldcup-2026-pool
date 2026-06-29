/**
 * Import knockout bracket picks from an Excel file into data/ko-picks.json.
 *
 * Usage:
 *   node scripts/import-ko.mjs <path-to-xlsx> <player-slug>
 *
 * Example:
 *   node scripts/import-ko.mjs ~/Downloads/Bracket_Visual_Quiniela_2026.xlsx eduardo-sama
 *
 * The player-slug must match an existing entry in data/predictions.json.
 *
 * Expected Excel "Export" sheet columns (any order):
 *   match_id | ronda | puntos | equipo_a | equipo_b | mi_pick
 *
 * Output format (per-match, keyed by match_id string):
 *   { "73": { teamA, teamB, pick, round, pts }, ... }
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");

// ── Spanish team name → teams.json key ───────────────────────────────────────
function normStr(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ES_TO_KEY = {
  sudafrica:            "South Africa",
  alemania:             "Germany",
  paisesbajos:          "Netherlands",
  holanda:              "Netherlands",
  brasil:               "Brazil",
  francia:              "France",
  costademarfil:        "Ivory Coast",
  mexico:               "Mexico",
  inglaterra:           "England",
  estadosunidos:        "USA",
  eeuu:                 "USA",
  usa:                  "USA",
  belgica:              "Belgium",
  croacia:              "Croatia",
  espana:               "Spain",
  suiza:                "Switzerland",
  argentina:            "Argentina",
  argenina:             "Argentina",   // common typo
  caboverde:            "Cape Verde",
  colombia:             "Colombia",
  ghana:                "Ghana",
  australia:            "Australia",
  egipto:               "Egypt",
  canada:               "Canada",
  rdcongo:              "DR Congo",
  republicademocraticadelcongo: "DR Congo",
  japon:                "Japan",
  noruega:              "Norway",
  ecuador:              "Ecuador",
  marruecos:            "Morocco",
  suecia:               "Sweden",
  paraguay:             "Paraguay",
  senegal:              "Senegal",
  bosniaherzegovina:    "Bosnia-Herzegovina",
  bosniayherzegovina:   "Bosnia-Herzegovina",
  bosnia:               "Bosnia-Herzegovina",
  portugal:             "Portugal",
  austria:              "Austria",
  algeria:              "Algeria",
  argelia:              "Algeria",
  coreadelsur:          "South Korea",
  republicadcorea:      "South Korea",
  uruguay:              "Uruguay",
  chile:                "Chile",
  peru:                 "Peru",
  venezuela:            "Venezuela",
  bolivia:              "Bolivia",
  honduras:             "Honduras",
  costarica:            "Costa Rica",
  panama:               "Panama",
  jamaica:              "Jamaica",
  haiti:                "Haiti",
  qatar:                "Qatar",
  catar:                "Qatar",
  arabsaudita:          "Saudi Arabia",
  iran:                 "Iran",
  iraq:                 "Iraq",
  nigeria:              "Nigeria",
  camerun:              "Cameroon",
  cameroon:             "Cameroon",
  tunez:                "Tunisia",
  tanzania:             "Tanzania",
  zambia:               "Zambia",
  mozambique:           "Mozambique",
  eslovaquia:           "Slovakia",
  rumania:              "Romania",
  hungria:              "Hungary",
  turquia:              "Turkey",
  chequia:              "Czech Republic",
  republicacheca:       "Czech Republic",
  sudcorea:             "South Korea",
  corea:                "South Korea",
  nuevazelanda:         "New Zealand",
  marroc:               "Morocco",
};

function resolveTeam(esName) {
  if (!esName) return null;
  const raw = String(esName).trim();
  const key = normStr(raw);
  if (ES_TO_KEY[key]) return ES_TO_KEY[key];
  // Fallback: return as-is (already in English, or unknown)
  console.warn(`  ⚠ Unknown team name: "${raw}" (norm: "${key}") — stored as-is`);
  return raw;
}

const RONDA_MAP = {
  "rondade32": "R32",
  "rondade16": "R16",
  "octavos":   "R16",
  "cuartos":   "QF",
  "semifinal": "SF",
  "final":     "FINAL",
};

const PTS_MAP = { R32: 10, R16: 20, QF: 40, SF: 80, FINAL: 160 };

function mapRound(ronda) {
  return RONDA_MAP[normStr(ronda)] ?? null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const [, , xlsxArg, slugArg] = process.argv;
if (!xlsxArg || !slugArg) {
  console.error("Usage: node scripts/import-ko.mjs <path-to-xlsx> <player-slug>");
  process.exit(1);
}

const xlsxPath = resolve(xlsxArg.replace(/^~/, process.env.HOME));
const slug = slugArg.trim();

// Validate slug exists in predictions.json
const predictions = JSON.parse(readFileSync(resolve(ROOT, "data/predictions.json"), "utf8"));
const playerExists = predictions.some((p) => p.slug === slug);
if (!playerExists) {
  console.error(`Slug "${slug}" not found in data/predictions.json. Available slugs:`);
  predictions.forEach((p) => console.error(`  ${p.slug}  (${p.name})`));
  process.exit(1);
}

// Read the Excel
const wb = XLSX.readFile(xlsxPath);
const ws = wb.Sheets["Export"];
if (!ws) {
  console.error('No "Export" sheet found in the workbook. Available sheets:', wb.SheetNames.join(", "));
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
console.log(`Read ${rows.length} rows from Export sheet`);

// Build per-match picks map (match_id → KoPickMatch)
const byMatch = {};
let skipped = 0;

for (const row of rows) {
  const matchId = String(row.match_id ?? "").trim();
  const ronda   = String(row.ronda    ?? "").trim();
  const teamAes = String(row.equipo_a ?? "").trim();
  const teamBes = String(row.equipo_b ?? "").trim();
  const pickEs  = String(row.mi_pick  ?? "").trim();

  if (!matchId || !ronda || !pickEs) { skipped++; continue; }

  const round = mapRound(ronda);
  if (!round) {
    console.warn(`  ⚠ Unrecognised ronda: "${ronda}" (match ${matchId})`);
    skipped++;
    continue;
  }

  const teamA = resolveTeam(teamAes);
  const teamB = resolveTeam(teamBes);
  const pick  = resolveTeam(pickEs);

  if (!teamA || !teamB || !pick) { skipped++; continue; }

  byMatch[matchId] = {
    teamA,
    teamB,
    pick,
    round,
    pts: PTS_MAP[round],
  };
}

const count = Object.keys(byMatch).length;
console.log(`\nParsed ${count} match picks (${skipped} skipped):`);
for (const [id, m] of Object.entries(byMatch).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  console.log(`  [${id}] ${m.round.padEnd(5)} ${m.teamA.padEnd(20)} vs ${m.teamB.padEnd(20)}  → ${m.pick}`);
}

if (count === 0) {
  console.error("\n✗ No picks parsed. Check that the Export sheet has columns: match_id, ronda, equipo_a, equipo_b, mi_pick");
  process.exit(1);
}

// Load and update ko-picks.json
const koPath = resolve(ROOT, "data/ko-picks.json");
let koPicks = {};
try {
  koPicks = JSON.parse(readFileSync(koPath, "utf8"));
} catch { /* file doesn't exist yet */ }

koPicks[slug] = byMatch;

writeFileSync(koPath, JSON.stringify(koPicks, null, 2) + "\n");
console.log(`\n✓ Saved ${count} picks for "${slug}" to data/ko-picks.json`);
