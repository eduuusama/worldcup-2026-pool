/**
 * Server-only helpers for reading/writing data/results.json on GitHub via the
 * Contents API, shared by the result-updating routes. Keeping git as the single
 * source of truth means a commit here triggers a redeploy and the live site
 * stays in lockstep with whatever updated the scores.
 *
 * Not imported by any client component — uses Buffer + a server token.
 */
import type { Match, Results, ResultEntry } from "./types";

const REPO = process.env.GITHUB_REPO ?? "eduuusama/worldcup-2026-pool";
const BRANCH = "main";
const RESULTS_PATH = "data/results.json";

// --- Open-world result mapping ---------------------------------------------
//
// We get results by asking the web to REPORT which matches were actually played
// (an open-world query — reliable). We never hand the model our fixture list and
// ask "which of these were played?" — that primes it to confabulate plausible
// results for games that haven't happened. Reported matches are mapped to our
// fixtures here, by team name, with the outcome resolved deterministically.

/** Common name variants the model returns -> our canonical (normalized) names. */
const ALIASES: Record<string, string> = {
  czechia: "czechrepublic",
  korearepublic: "southkorea",
  korea: "southkorea",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  us: "usa",
  usmnt: "usa",
  cotedivoire: "ivorycoast",
  bosniaandherzegovina: "bosniaherzegovina",
  bosnia: "bosniaherzegovina",
  democraticrepublicofthecongo: "drcongo",
  congodr: "drcongo",
  congo: "drcongo",
  caboverde: "capeverde",
  turkiye: "turkey",
};

export function canon(name: string): string {
  const n = String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]/g, "");
  return ALIASES[n] ?? n;
}

export interface Played {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  date: string; // YYYY-MM-DD
}

export interface RecordedItem {
  id: number;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  outcome: "1" | "X" | "2";
  date: string;
}

/** Keep only well-formed, non-future results. */
export function validPlayed(list: unknown, today: string): Played[] {
  if (!Array.isArray(list)) return [];
  return (list as Played[]).filter(
    (p) =>
      p &&
      typeof p.home === "string" &&
      typeof p.away === "string" &&
      Number.isFinite(p.homeScore) &&
      Number.isFinite(p.awayScore) &&
      typeof p.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
      p.date <= today
  );
}

/**
 * Map reported played matches onto our fixtures and fill any that are still
 * pending. Mutates `results`; returns the newly-recorded items. Each group-stage
 * team pair is unique, so matching by unordered pair is unambiguous.
 */
export function recordPlayed(
  results: Results,
  played: Played[],
  matches: Match[],
  source: string
): RecordedItem[] {
  const byPair = new Map<string, Match>();
  for (const m of matches) byPair.set([canon(m.teamA), canon(m.teamB)].sort().join("|"), m);

  const recorded: RecordedItem[] = [];
  for (const p of played) {
    const match = byPair.get([canon(p.home), canon(p.away)].sort().join("|"));
    if (!match || results[String(match.id)]?.outcome) continue;
    const homeIsA = canon(p.home) === canon(match.teamA);
    const scoreA = homeIsA ? p.homeScore : p.awayScore;
    const scoreB = homeIsA ? p.awayScore : p.homeScore;
    const outcome = scoreA > scoreB ? "1" : scoreA < scoreB ? "2" : "X";
    results[String(match.id)] = {
      outcome,
      scoreA,
      scoreB,
      status: "final",
      source,
      updatedAt: p.date,
    } as ResultEntry;
    recorded.push({ id: match.id, teamA: match.teamA, teamB: match.teamB, scoreA, scoreB, outcome, date: p.date });
  }
  return recorded;
}

export async function ghGetResults(token: string): Promise<{ results: Results; sha: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${RESULTS_PATH}?ref=${BRANCH}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { results: JSON.parse(content) as Results, sha: data.sha as string };
}

export async function ghPutResults(token: string, results: Results, sha: string, message: string) {
  const body = {
    message,
    content: Buffer.from(JSON.stringify(results, null, 2) + "\n").toString("base64"),
    sha,
    branch: BRANCH,
    committer: { name: "Quinela Bot", email: "quinela@aiclear.org" },
  };
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${RESULTS_PATH}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT failed ${res.status}: ${await res.text()}`);
}

/** Pull the first JSON value (object or array) out of an LLM response. */
export function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return null;
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === open) depth++;
    else if (cleaned[i] === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
