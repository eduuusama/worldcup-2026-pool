import type { Match, Player, Results, ResultEntry } from "./types";
import { leaderboard, type PlayerScore } from "./scoring";

/**
 * Recap data for the daily email — standings before vs. after a given day,
 * the matches decided that day, and how the top 5 shifted.
 *
 * A match "belongs" to a day by its result's `updatedAt` (the day it was
 * recorded as played), NOT by the spreadsheet's `date` field, which is a
 * simulated calendar that drifts from the official fixtures.
 *
 * Standings reuse `leaderboard()` (the same ranking the website shows) over a
 * filtered results map, so the email and the site can never disagree.
 */

export interface DayResult {
  id: number;
  group: string;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  outcome: "1" | "X" | "2";
}

export interface Movements {
  enteredTop5: string[];
  leftTop5: string[];
  deltas: { name: string; from: number; to: number }[];
}

export interface RecapData {
  day: string;
  dayResults: DayResult[];
  before: PlayerScore[];
  after: PlayerScore[];
  movements: Movements;
}

/** Keep only results whose `updatedAt` satisfies the predicate (and that have an outcome). */
function filterResults(results: Results, keep: (updatedAt: string) => boolean): Results {
  const out: Results = {};
  for (const [id, r] of Object.entries(results)) {
    if (r.outcome && r.updatedAt && keep(r.updatedAt)) out[id] = r;
  }
  return out;
}

const top5 = (board: PlayerScore[]) => new Set(board.filter((r) => r.rank <= 5).map((r) => r.slug));

export function buildRecap(
  matches: Match[],
  players: Player[],
  results: Results,
  day: string
): RecapData {
  // ISO date strings (YYYY-MM-DD) compare correctly as plain strings.
  const before = leaderboard(players, matches, filterResults(results, (d) => d < day));
  const after = leaderboard(players, matches, filterResults(results, (d) => d <= day));

  const dayResults: DayResult[] = matches
    .filter((m) => {
      const r = results[String(m.id)];
      return r?.outcome && r.updatedAt === day;
    })
    .map((m) => {
      const r = results[String(m.id)] as ResultEntry;
      return {
        id: m.id,
        group: m.group,
        teamA: m.teamA,
        teamB: m.teamB,
        scoreA: r.scoreA,
        scoreB: r.scoreB,
        outcome: r.outcome as "1" | "X" | "2",
      };
    });

  const beforeTop = top5(before);
  const afterTop = top5(after);
  const rankBefore = Object.fromEntries(before.map((r) => [r.slug, r.rank] as const));

  const movements: Movements = {
    enteredTop5: after.filter((r) => afterTop.has(r.slug) && !beforeTop.has(r.slug)).map((r) => r.name),
    leftTop5: before.filter((r) => beforeTop.has(r.slug) && !afterTop.has(r.slug)).map((r) => r.name),
    deltas: after
      .map((r) => ({ name: r.name, from: rankBefore[r.slug], to: r.rank }))
      .filter((d) => d.from !== undefined && d.from !== d.to),
  };

  return { day, dayResults, before, after, movements };
}
