/**
 * Build-time importer for the Gran Quinela Mundialista.
 *
 * Reads every `data/predictions/*.xlsx` (one file per player), and emits:
 *   - data/matches.json      canonical list of the 72 group-stage matches
 *   - data/predictions.json  each player's 1 / X / 2 picks keyed by match id
 *   - data/results.json      skeleton (merged, never clobbers known results)
 *
 * Excel layout ("My Predictions" sheet):
 *   row with col B === "#"  -> header; col F holds the player's name ("Your Name:")
 *   rows where col B is 1..72 -> matches:  B=#  C=Grp  D=Date  E=Match  F=pick
 *   Match string looks like "South Africa  vs  Mexico"; pick is "1" | "X" | "2".
 *
 * Name resolution: cell F<header> if personalised, else the filename stem.
 * So naming a file `Edu.xlsx` / `Maria.xlsx` is the easiest path.
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

interface Player {
  slug: string;
  name: string;
  file: string;
  picks: Record<string, Pick>;
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
  const norm = raw.replace(/\s+/g, " ").trim();
  const parts = norm.split(/\s+vs\.?\s+/i);
  if (parts.length !== 2) return null;
  return { teamA: parts[0].trim(), teamB: parts[1].trim() };
}

function readSheet(file: string): { name: string; matches: Match[]; picks: Record<string, Pick> } {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  // header:1 produces arrays whose index 0 maps to the FIRST column in the sheet's
  // used range — which may be A or B depending on how the file was saved. So we
  // never hard-code column positions; we discover them from the header row labels.
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });

  const cell = (r: unknown[] | undefined, i: number) => String(r?.[i] ?? "").trim();

  const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? "").trim() === "#"));
  const header = headerIdx >= 0 ? rows[headerIdx] : [];
  const findCol = (pred: (s: string) => boolean) => header.findIndex((c) => pred(String(c ?? "").trim()));

  const colNum = findCol((s) => s === "#");
  const colGrp = findCol((s) => /^grp/i.test(s));
  const colMatch = findCol((s) => /^(match|partido)$/i.test(s));
  let colPick = findCol((s) => /your name|nombre|name/i.test(s));
  if (colPick < 0) {
    for (let i = colMatch + 1; i < header.length; i++) {
      if (cell(header, i)) { colPick = i; break; }
    }
  }
  if (colPick < 0) colPick = colMatch + 1;

  const nameCell = cell(header, colPick);
  const stem = path.basename(file).replace(/\.xlsx$/i, "");
  const name = nameCell && !PLACEHOLDER_NAMES.has(nameCell.toLowerCase()) ? nameCell : stem;

  const matches: Match[] = [];
  const picks: Record<string, Pick> = {};

  for (const r of rows) {
    const num = parseInt(cell(r, colNum), 10);
    if (!Number.isInteger(num) || num < 1 || num > 200) continue;

    const group = cell(r, colGrp).replace(/^Grp\s*/i, "").trim();
    const parsed = parseMatchString(cell(r, colMatch));
    if (!parsed) continue;

    matches.push({ id: num, group, teamA: parsed.teamA, teamB: parsed.teamB, date: cell(r, colGrp >= 0 ? colMatch - 1 : 3) });

    const pickRaw = cell(r, colPick).toUpperCase();
    if (pickRaw === "1" || pickRaw === "X" || pickRaw === "2") picks[String(num)] = pickRaw as Pick;
  }

  return { name, matches, picks };
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
  const players: Player[] = [];
  const seenSlugs = new Set<string>();

  for (const f of files) {
    const full = path.join(PRED_DIR, f);
    const { name, matches, picks } = readSheet(full);

    if (!canonicalMatches) {
      canonicalMatches = matches;
    } else {
      // Validate this file's matches agree with the canonical set.
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

    let slug = slugify(name) || slugify(f.replace(/\.xlsx$/i, ""));
    let n = 2;
    const base = slug;
    while (seenSlugs.has(slug)) slug = `${base}-${n++}`;
    seenSlugs.add(slug);

    players.push({ slug, name, file: f, picks });
    console.log(`[import] ${f} -> ${name} (${slug}): ${Object.keys(picks).length} picks`);
  }

  const matches = (canonicalMatches ?? []).sort((a, b) => a.id - b.id);

  // matches.json
  fs.writeFileSync(path.join(DATA_DIR, "matches.json"), JSON.stringify(matches, null, 2) + "\n");

  // predictions.json
  fs.writeFileSync(
    path.join(DATA_DIR, "predictions.json"),
    JSON.stringify(
      players.map((p) => ({ slug: p.slug, name: p.name, picks: p.picks })),
      null,
      2
    ) + "\n"
  );

  // results.json — merge: keep existing outcomes, add null skeleton for new matches.
  const resultsPath = path.join(DATA_DIR, "results.json");
  const existing: Record<string, ResultEntry> = fs.existsSync(resultsPath)
    ? JSON.parse(fs.readFileSync(resultsPath, "utf8"))
    : {};
  const merged: Record<string, ResultEntry> = {};
  for (const m of matches) {
    merged[String(m.id)] =
      existing[String(m.id)] ?? {
        outcome: null,
        scoreA: null,
        scoreB: null,
        status: "scheduled",
        source: null,
        updatedAt: null,
      };
  }
  fs.writeFileSync(resultsPath, JSON.stringify(merged, null, 2) + "\n");

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

  console.log(`[import] Done: ${matches.length} matches, ${players.length} players.`);
}

main();
