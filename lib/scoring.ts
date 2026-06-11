import type { Match, Player, Results } from "./types";

export interface PlayerScore {
  slug: string;
  name: string;
  points: number; // 1 per correct pick
  correct: number;
  wrong: number;
  played: number; // matches with a final result
  pending: number; // matches still undecided
  total: number;
  accuracy: number; // correct / played
  rank: number; // competition ranking (1, 2, 2, 4, ...)
}

/** Score a single player over the decided matches. */
export function scorePlayer(player: Player, matches: Match[], results: Results) {
  let correct = 0;
  let played = 0;
  for (const m of matches) {
    const outcome = results[String(m.id)]?.outcome ?? null;
    if (outcome === null) continue;
    played++;
    if (player.picks[String(m.id)] === outcome) correct++;
  }
  const total = matches.length;
  return {
    correct,
    played,
    wrong: played - correct,
    pending: total - played,
    total,
    points: correct,
    accuracy: played ? correct / played : 0,
  };
}

/** Full leaderboard: scored, sorted (points desc, then name), with competition ranks. */
export function leaderboard(players: Player[], matches: Match[], results: Results): PlayerScore[] {
  const scored = players
    .map((p) => ({ slug: p.slug, name: p.name, ...scorePlayer(p, matches, results) }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  let rank = 0;
  let prevPoints = Number.NaN;
  return scored.map((s, i) => {
    if (s.points !== prevPoints) {
      rank = i + 1;
      prevPoints = s.points;
    }
    return { ...s, rank };
  });
}

export interface GroupBreakdown {
  group: string;
  correct: number;
  played: number;
  pending: number;
  total: number;
}

/** Per-group correct/played for a player's profile. */
export function groupBreakdown(player: Player, matches: Match[], results: Results): GroupBreakdown[] {
  const groups = [...new Set(matches.map((m) => m.group))].sort();
  return groups.map((group) => {
    const gm = matches.filter((m) => m.group === group);
    let correct = 0;
    let played = 0;
    for (const m of gm) {
      const outcome = results[String(m.id)]?.outcome ?? null;
      if (outcome === null) continue;
      played++;
      if (player.picks[String(m.id)] === outcome) correct++;
    }
    return { group, correct, played, pending: gm.length - played, total: gm.length };
  });
}

/** For a given match, how many players picked each outcome and how many were right. */
export function matchPickStats(matchId: number, players: Player[], outcome: string | null) {
  const counts = { "1": 0, X: 0, "2": 0 } as Record<string, number>;
  for (const p of players) {
    const pick = p.picks[String(matchId)];
    if (pick) counts[pick]++;
  }
  const correctCount = outcome ? counts[outcome] ?? 0 : 0;
  return { counts, correctCount, totalPlayers: players.length };
}
