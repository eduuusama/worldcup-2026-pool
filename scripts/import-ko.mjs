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
 * The Excel file must have an "Export" sheet with columns:
 *   participante | match_id | ronda | puntos | equipo_a | equipo_b | mi_pick
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
  republica:            "DR Congo",    // partial match safety
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
  panamá:               "Panama",
  panama:               "Panama",
  jamaica:              "Jamaica",
  haiti:                "Haiti",
  qatar:                "Qatar",
  catar:                "Qatar",
  arabsaudita:          "Saudi Arabia",
  iran:                 "Iran",
  irak:                 "Iraq",
  iraq:                 "Iraq",
  marroc:               "Morocco",
  nigeria:              "Nigeria",
  camerun:              "Cameroon",
  cameroon:             "Cameroon",
  tunez:                "Tunisia",
  tunecia:              "Tunisia",
  tanzania:             "Tanzania",
  zambia:               "Zambia",
  mozambique:           "Mozambique",
  bielorusia:           "Belarus",
  eslovaquia:           "Slovakia",
  rumania:              "Romania",
  hungria:              "Hungary",
  turquia:              "Turkey",
  chequia:              "Czech Republic",
  chequiarepublica:     "Czech Republic",
  republicacheca:       "Czech Republic",
};

function resolveTeam(esName) {
  if (!esName) return null;
  const key = normStr(esName);
  if (ES_TO_KEY[key]) return ES_TO_KEY[key];
  // Fallback: return PascalCase version — will still work if it matches teams.json key exactly
  console.warn(`  ⚠ Unknown team name: "${esName}" (norm: "${key}") — stored as-is`);
  return String(esName).trim();
}

const RONDA_MAP = {
  "rondade32": "R32",
  "rondade16": "R16",
  "octavos":   "R16",
  "cuartos":   "QF",
  "semifinal": "SF",
  "final":     "FINAL",
};

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

// Group picks by round
const byRound = {};
for (const row of rows) {
  const ronda = String(row.ronda ?? "").trim();
  const pick  = String(row.mi_pick ?? "").trim();
  if (!ronda || !pick) continue;

  const round = mapRound(ronda);
  if (!round) {
    console.warn(`  ⚠ Unrecognised ronda: "${ronda}"`);
    continue;
  }

  const teamKey = resolveTeam(pick);
  if (!teamKey) continue;

  if (!byRound[round]) byRound[round] = [];
  byRound[round].push(teamKey);
}

console.log("Picks per round:");
for (const [r, picks] of Object.entries(byRound)) {
  console.log(`  ${r}: [${picks.join(", ")}]`);
}

// Load and update ko-picks.json
const koPath = resolve(ROOT, "data/ko-picks.json");
let koPicks = {};
try {
  koPicks = JSON.parse(readFileSync(koPath, "utf8"));
} catch { /* file doesn't exist yet */ }

koPicks[slug] = byRound;

writeFileSync(koPath, JSON.stringify(koPicks, null, 2) + "\n");
console.log(`\n✓ Saved picks for "${slug}" to data/ko-picks.json`);
