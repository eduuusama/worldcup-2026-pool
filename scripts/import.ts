/**
 * Build-time importer for the Gran Quinela Mundialista.
 *
 * Reads every `data/predictions/*.xlsx` and emits:
 *   - data/matches.json      canonical list of the 72 group-stage matches
 *   - data/predictions.json  each player's 1 / X / 2 picks keyed by match id
 *   - data/results.json      merged (never clobbers known results)
 *
 * Two sheet formats are supported, detected from the header row (the row
 * containing "#"):
 *
 * 1. Single-player template — columns: # | Grp | Date | Match | Your Name:
 *    One pick column; player name comes from the "Your Name:" cell if
 *    personalised, else from the filename stem (`Maria.xlsx` -> "Maria").
 *
 * 2. Multi-player tracker — columns: # | Group | Date | Match |
 *    Official Result | <player 1> | <player 2> | ...
 *    Every named column after Match is a player; the Official Result column
 *    (matched by /official|result/i) feeds results.json for matches that
 *    don't already have an outcome.
 *
 * Columns are located by header label, never by position — different Excel
 * producers shift the used range (A2:G76 vs B2:U76), so indices are unstable.
 * Picks are normalised (lowercase x, numeric cells). Matches are identified
 * by the teams as listed (teamA = the "1" side, teamB = the "2" side).
 */
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PRED_DIR = path.join(ROOT, "data", "predictions");
const DATA_DIR = path.join(ROOT, "data");

type Pick = "1" | "X" | "2";

interface Match {
  id: number;
  group: string; // "A".."L"
  teamA: string; // the "1" side, verbatim from the sheet
  teamB: string; // the "2" side
  date: string; // sheet date string (approximate — for display only)
}

interface PlayerData {
  name: string;
  picks: Record<string, Pick>;
}

interface SheetData {
  players: PlayerData[];
  matches: Match[];
  official: Record<string, Pick>;
}

interface ResultEntry {
  outcome: Pick | null;
  scoreA: number | null;
  scoreB: number | null;
  status: "scheduled" | "final";
  source: string | null;
  updatedAt: string | null;
}

const PLACEHOLDER_NAMES = new Set(["your name:", "your name", "name", "nombre", ""]);

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseMatchString(raw: string): { teamA: string; teamB: string } | null {
  const parts = raw.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;
  return { teamA: parts[0].trim(), teamB: parts[1].trim() };
}

function normalizePick(raw: string): Pick | null {
  const s = raw.trim().toUpperCase();
  return s === "1" || s === "X" || s === "2" ? (s as Pick) : null;
}

function readSheet(file: string): SheetData {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });

  // Collapse internal whitespace too — header cells can contain newlines
  // ("Official\nResult") and names trailing spaces ("Enrique ").
  const cell = (r: unknown[] | undefined, i: number) =>
    String(r?.[i] ?? "").replace(/\s+/g, " ").trim();

  const headerIdx = rows.findIndex((r) => (r ?? []).some((c) => String(c ?? "").trim() === "#"));
  if (headerIdx < 0) throw new Error(`${path.basename(file)}: no header row (no "#" column) found`);
  const header = rows[headerIdx];
  const findCol = (pred: (s: string) => boolean) =>
    header.findIndex((c) => pred(String(c ?? "").replace(/\s+/g, " ").trim()));

  const colNum = findCol((s) => s === "#");
  const colGrp = findCol((s) => /^(grp|group|grupo)/i.test(s));
  const colDate = findCol((s) => /^(date|fecha)/i.test(s));
  const colMatch = findCol((s) => /^(match|partido)/i.test(s));
  const colResult = findCol((s) => /official|resultado|result/i.test(s));
  if (colMatch < 0) throw new Error(`${path.basename(file)}: no Match column found`);

  // Every named column after Match (minus the official-result column) is a player.
  const playerCols: { col: number; name: string }[] = [];
  for (let i = colMatch + 1; i < header.length; i++) {
    if (i === colResult) continue;
    const h = cell(header, i);
    if (h) playerCols.push({ col: i, name: h });
  }
  // Single-player template: the pick column header is the "Your Name:" placeholder.
  const stem = path.basename(file).replace(/\.xlsx$/i, "");
  if (playerCols.length === 0 && colResult < 0) {
    // Header cell may be entirely empty (defval null) — fall back to first column after Match.
    playerCols.push({ col: colMatch + 1, name: stem });
  }
  for (const pc of playerCols) {
    if (PLACEHOLDER_NAMES.has(pc.name.toLowerCase())) pc.name = stem;
  }

  const matches: Match[] = [];
  const official: Record<string, Pick> = {};
  const players: PlayerData[] = playerCols.map((pc) => ({ name: pc.name, picks: {} }));

  for (const r of rows) {
    const num = parseInt(cell(r, colNum), 10);
    if (!Number.isInteger(num) || num < 1 || num > 200) continue;

    const group = cell(r, colGrp).replace(/^(Grp|Group|Grupo)\s*/i, "").trim();
    const parsed = parseMatchString(cell(r, colMatch));
    if (!parsed) continue;

    matches.push({
      id: num,
      group,
      teamA: parsed.teamA,
      teamB: parsed.teamB,
      date: colDate >= 0 ? cell(r, colDate) : "",
    });

    if (colResult >= 0) {
      const o = normalizePick(cell(r, colResult));
      if (o) official[String(num)] = o;
    }

    playerCols.forEach((pc, i) => {
      const pick = normalizePick(cell(r, pc.col));
      if (pick) players[i].picks[String(num)] = pick;
    });
  }

  return { players, matches, official };
}

function main() {
  if (!fs.existsSync(PRED_DIR)) {
    console.error(`[import] No predictions dir at ${PRED_DIR}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(PRED_DIR)
    .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$"))
    .sort();

  if (files.length === 0) {
    console.warn("[import] No .xlsx files found in data/predictions — nothing to import.");
  }

  let canonicalMatches: Match[] | null = null;
  const allPlayers: { slug: string; name: string; picks: Record<string, Pick> }[] = [];
  const officialMerged: Record<string, Pick> = {};
  const seenSlugs = new Set<string>();

  for (const f of files) {
    const full = path.join(PRED_DIR, f);
    const { players, matches, official } = readSheet(full);

    if (!canonicalMatches) {
      canonicalMatches = matches;
    } else {
      const byId = new Map(canonicalMatches.map((m) => [m.id, m]));
      for (const m of matches) {
        const c = byId.get(m.id);
        if (c && (c.teamA !== m.teamA || c.teamB !== m.teamB)) {
          console.warn(
            `[import] ${f}: match #${m.id} "${m.teamA} vs ${m.teamB}" differs from canonical "${c.teamA} vs ${c.teamB}" — keeping canonical.`
          );
        }
      }
    }

    Object.assign(officialMerged, official);

    for (const p of players) {
      let slug = slugify(p.name) || slugify(f.replace(/\.xlsx$/i, ""));
      let n = 2;
      const base = slug;
      while (seenSlugs.has(slug)) slug = `${base}-${n++}`;
      seenSlugs.add(slug);
      allPlayers.push({ slug, name: p.name, picks: p.picks });
      console.log(`[import] ${f} -> ${p.name} (${slug}): ${Object.keys(p.picks).length} picks`);
    }
  }

  const matches = (canonicalMatches ?? []).sort((a, b) => a.id - b.id);

  // matches.json
  fs.writeFileSync(path.join(DATA_DIR, "matches.json"), JSON.stringify(matches, null, 2) + "\n");

  // predictions.json
  fs.writeFileSync(
    path.join(DATA_DIR, "predictions.json"),
    JSON.stringify(allPlayers, null, 2) + "\n"
  );

  // results.json — merge precedence: existing non-null outcome (the auto-updater
  // and set-result own this file) > Official Result column > null skeleton.
  const resultsPath = path.join(DATA_DIR, "results.json");
  const existing: Record<string, ResultEntry> = fs.existsSync(resultsPath)
    ? JSON.parse(fs.readFileSync(resultsPath, "utf8"))
    : {};
  const today = new Date().toISOString().slice(0, 10);
  const merged: Record<string, ResultEntry> = {};
  let fromOfficial = 0;
  for (const m of matches) {
    const id = String(m.id);
    const prev = existing[id];
    if (prev?.outcome) {
      merged[id] = prev;
    } else if (officialMerged[id]) {
      merged[id] = {
        outcome: officialMerged[id],
        scoreA: prev?.scoreA ?? null,
        scoreB: prev?.scoreB ?? null,
        status: "final",
        source: "Official Result column (tracker spreadsheet)",
        updatedAt: today,
      };
      fromOfficial++;
    } else {
      merged[id] = prev ?? {
        outcome: null,
        scoreA: null,
        scoreB: null,
        status: "scheduled",
        source: null,
        updatedAt: null,
      };
    }
  }
  fs.writeFileSync(resultsPath, JSON.stringify(merged, null, 2) + "\n");
  if (fromOfficial) console.log(`[import] ${fromOfficial} result(s) adopted from Official Result column.`);

  // Validate team coverage against teams.json (warn only).
  const teamsPath = path.join(DATA_DIR, "teams.json");
  if (fs.existsSync(teamsPath)) {
    const teams = JSON.parse(fs.readFileSync(teamsPath, "utf8"));
    const missing = new Set<string>();
    for (const m of matches) {
      if (!teams[m.teamA]) missing.add(m.teamA);
      if (!teams[m.teamB]) missing.add(m.teamB);
    }
    if (missing.size) console.warn(`[import] Teams missing from teams.json: ${[...missing].join(", ")}`);
  }

  console.log(`[import] Done: ${matches.length} matches, ${allPlayers.length} players.`);
}

main();
