import teamsJson from "@/data/teams.json";
import type { TeamInfo } from "./types";
import { canon } from "./results-sync";

/**
 * Knockout bracket for the 2026 FIFA World Cup.
 *
 * The bracket TOPOLOGY is FIXED and published by FIFA (no redraws): match IDs
 * 73–104, where each later-round match is fed by two earlier matches. We hardcode
 * that topology + the R32 pairings (the simulated draw everyone predicted against)
 * and overlay ESPN's live scores by matching TEAM NAMES.
 *
 * Why not trust ESPN's own bracket refs? ESPN numbers its events by event-ID
 * order, which does NOT equal FIFA's "Round of 32 N" slot numbers. Following
 * ESPN's refs scrambles the halves (e.g. Brazil/France end up on the wrong side).
 * Matching by team name sidesteps that entirely and always agrees with the
 * official bracket.
 */

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

export type RoundKey = "R32" | "R16" | "QF" | "SF" | "BRONZE" | "FINAL";

// ── Fixed FIFA topology ──────────────────────────────────────────────────────

// R32 pairings: FIFA match id → [home team key, away team key] (teams.json keys).
const R32_PAIRINGS: Record<number, [string, string]> = {
  73: ["South Africa", "Canada"],
  74: ["Germany", "Paraguay"],
  75: ["Netherlands", "Morocco"],
  76: ["Brazil", "Japan"],
  77: ["France", "Sweden"],
  78: ["Ivory Coast", "Norway"],
  79: ["Mexico", "Ecuador"],
  80: ["England", "DR Congo"],
  81: ["USA", "Bosnia-Herzegovina"],
  82: ["Belgium", "Senegal"],
  83: ["Portugal", "Croatia"],
  84: ["Spain", "Austria"],
  85: ["Switzerland", "Algeria"],
  86: ["Argentina", "Cape Verde"],
  87: ["Colombia", "Ghana"],
  88: ["Australia", "Egypt"],
};

// Winners propagate up: match id → [feeder1, feeder2] (FIFA fixed bracket).
const FEEDERS: Record<number, [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 103: [101, 102],
};

// 3rd-place match: the two SF losers.
const BRONZE_ID = 104;
const BRONZE_FROM: [number, number] = [101, 102];

const ROUND_OF = (id: number): RoundKey =>
  id <= 88 ? "R32" : id <= 96 ? "R16" : id <= 100 ? "QF" : id <= 102 ? "SF" : id === BRONZE_ID ? "BRONZE" : "FINAL";

// Fallback kickoff (FIFA schedule) — used only until ESPN supplies the real
// datetime once both teams are known.
const FALLBACK_DATE: Record<number, string> = {
  89: "2026-07-04T18:00Z", 90: "2026-07-04T22:00Z",
  91: "2026-07-05T18:00Z", 92: "2026-07-05T22:00Z",
  93: "2026-07-06T18:00Z", 94: "2026-07-06T22:00Z",
  95: "2026-07-07T18:00Z", 96: "2026-07-07T22:00Z",
  97: "2026-07-09T20:00Z", 98: "2026-07-10T20:00Z",
  99: "2026-07-11T20:00Z", 100: "2026-07-12T01:00Z",
  101: "2026-07-14T19:00Z", 102: "2026-07-15T19:00Z",
  104: "2026-07-18T21:00Z", 103: "2026-07-19T19:00Z",
};

// Date ranges to pull from ESPN (covers the whole knockout stage).
const KO_DATES = [
  "20260628", "20260629", "20260630", "20260701", "20260702", "20260703", "20260704",
  "20260705", "20260706", "20260707",
  "20260709", "20260710", "20260711", "20260712",
  "20260714", "20260715",
  "20260718", "20260719",
];

const teams = teamsJson as Record<string, TeamInfo>;
const canonToKey: Record<string, string> = {};
for (const key of Object.keys(teams)) canonToKey[canon(key)] = key;

// ── Output shape ─────────────────────────────────────────────────────────────

export interface BracketSide {
  teamKey: string | null; // teams.json key, or null while still TBD
  score: number | null;
  winner: boolean;
}

export interface BracketMatch {
  id: number;
  round: RoundKey;
  date: string; // ISO UTC kickoff
  state: "pre" | "in" | "post";
  home: BracketSide;
  away: BracketSide;
}

export interface Bracket {
  // Keyed by FIFA match id (string for JSON friendliness).
  matches: Record<string, BracketMatch>;
  updatedAt: string;
}

// ── ESPN live result lookup (by team pair) ───────────────────────────────────

interface PairResult {
  scoreByCanon: Record<string, number | null>;
  winnerCanon: string | null;
  state: "pre" | "in" | "post";
  date: string;
}

function pairKey(a: string, b: string): string {
  return [canon(a), canon(b)].sort().join("|");
}

async function fetchDate(date: string) {
  try {
    const res = await fetch(`${ESPN}?dates=${date}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.events ?? []) as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

/** Build a {team-pair → live result} index from ESPN's knockout events. */
async function fetchEspnResults(): Promise<Map<string, PairResult>> {
  const lists = await Promise.all(KO_DATES.map(fetchDate));
  const events = lists.flat();
  const byPair = new Map<string, PairResult>();

  for (const ev of events) {
    const comp = (ev as { competitions?: Array<Record<string, unknown>> }).competitions?.[0] ?? {};
    const competitors = (comp.competitors as Array<{
      homeAway: string;
      score?: string;
      winner?: boolean;
      team?: { displayName?: string };
    }>) ?? [];
    if (competitors.length !== 2) continue;

    // Resolve both sides to real team keys; skip if either is still a placeholder.
    const sides = competitors.map((c) => {
      const name = c.team?.displayName ?? "";
      const key = canonToKey[canon(name)] ?? null;
      const scoreNum =
        c.score != null && c.score !== "" ? parseInt(c.score, 10) : null;
      return {
        key,
        canon: key ? canon(key) : null,
        score: Number.isFinite(scoreNum as number) ? (scoreNum as number) : null,
        winner: !!c.winner,
      };
    });
    if (!sides[0].key || !sides[1].key) continue;

    const status = (comp.status as { type?: { state?: string } })?.type?.state ?? "pre";
    const state = (status === "post" || status === "in" ? status : "pre") as "pre" | "in" | "post";
    const winnerCanon = sides.find((s) => s.winner)?.canon ?? null;

    byPair.set(pairKey(sides[0].key, sides[1].key), {
      scoreByCanon: {
        [sides[0].canon as string]: sides[0].score,
        [sides[1].canon as string]: sides[1].score,
      },
      winnerCanon,
      state,
      date: String(ev.date ?? ""),
    });
  }

  return byPair;
}

// ── Resolve the fixed bracket against live results ───────────────────────────

export async function fetchBracket(): Promise<Bracket> {
  const byPair = await fetchEspnResults();
  const matches: Record<string, BracketMatch> = {};

  const sideFor = (teamKey: string | null, res: PairResult | null): BracketSide => {
    const c = teamKey ? canon(teamKey) : null;
    return {
      teamKey,
      score: res && c ? res.scoreByCanon[c] ?? null : null,
      winner: !!(res && c && res.winnerCanon === c),
    };
  };

  // Memoized resolution of a match's two team keys + result.
  const cache = new Map<number, { home: string | null; away: string | null; res: PairResult | null }>();

  function teamsOf(id: number): { home: string | null; away: string | null; res: PairResult | null } {
    const hit = cache.get(id);
    if (hit) return hit;

    let home: string | null;
    let away: string | null;

    if (id <= 88) {
      [home, away] = R32_PAIRINGS[id];
    } else if (id === BRONZE_ID) {
      home = loserOf(BRONZE_FROM[0]);
      away = loserOf(BRONZE_FROM[1]);
    } else {
      const [f1, f2] = FEEDERS[id];
      home = winnerOf(f1);
      away = winnerOf(f2);
    }

    const res = home && away ? byPair.get(pairKey(home, away)) ?? null : null;
    const out = { home, away, res };
    cache.set(id, out);
    return out;
  }

  function winnerOf(id: number): string | null {
    const { home, away, res } = teamsOf(id);
    if (!res || res.state !== "post" || !res.winnerCanon) return null;
    if (home && canon(home) === res.winnerCanon) return home;
    if (away && canon(away) === res.winnerCanon) return away;
    return null;
  }

  function loserOf(id: number): string | null {
    const { home, away, res } = teamsOf(id);
    if (!res || res.state !== "post" || !res.winnerCanon) return null;
    if (home && canon(home) !== res.winnerCanon) return home;
    if (away && canon(away) !== res.winnerCanon) return away;
    return null;
  }

  const allIds = [
    ...Object.keys(R32_PAIRINGS).map(Number),
    ...Object.keys(FEEDERS).map(Number),
    BRONZE_ID,
  ];

  for (const id of allIds) {
    const { home, away, res } = teamsOf(id);
    matches[String(id)] = {
      id,
      round: ROUND_OF(id),
      date: res?.date || FALLBACK_DATE[id] || "",
      state: res?.state ?? "pre",
      home: sideFor(home, res),
      away: sideFor(away, res),
    };
  }

  return { matches, updatedAt: new Date().toISOString() };
}
