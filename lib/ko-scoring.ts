/**
 * Scoring for the knockout-stage bracket pool.
 * Each player submits one pick per round per match (which team advances).
 * Points scale: R32=10, R16=20, QF=40, SF=80, FINAL=160.
 */

export type KoRoundKey = "R32" | "R16" | "QF" | "SF" | "FINAL";

export const KO_PTS: Record<KoRoundKey, number> = {
  R32: 10,
  R16: 20,
  QF: 40,
  SF: 80,
  FINAL: 160,
};

export const KO_ROUNDS: KoRoundKey[] = ["R32", "R16", "QF", "SF", "FINAL"];

export type KoPicks = Record<string, Partial<Record<KoRoundKey, string[]>>>;

export type PickStatus = "correct" | "wrong" | "pending";

export interface RoundSummary {
  correct: number;
  resolved: number; // picks whose outcome is known (correct + wrong)
  pending: number;  // picks whose match hasn't been played yet
  pts: number;
}

export interface KoScore {
  byRound: Partial<Record<KoRoundKey, RoundSummary>>;
  total: number;
}

// Mirrors the shape of /api/bracket response — no server imports needed.
interface Side { teamKey: string | null; winner: boolean }
interface MatchLike { state: "pre" | "in" | "post"; home: Side; away: Side }
export interface BracketLike { rounds: Partial<Record<string, MatchLike[]>> }

function norm(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "");
}

function getWinners(matches: MatchLike[]): Set<string> {
  const s = new Set<string>();
  for (const m of matches) {
    if (m.state !== "post") continue;
    if (m.home.winner && m.home.teamKey) s.add(norm(m.home.teamKey));
    if (m.away.winner && m.away.teamKey) s.add(norm(m.away.teamKey));
  }
  return s;
}

function getEliminated(matches: MatchLike[]): Set<string> {
  const s = new Set<string>();
  for (const m of matches) {
    if (m.state !== "post") continue;
    if (!m.home.winner && m.home.teamKey) s.add(norm(m.home.teamKey));
    if (!m.away.winner && m.away.teamKey) s.add(norm(m.away.teamKey));
  }
  return s;
}

function isRoundComplete(matches: MatchLike[]): boolean {
  return matches.length > 0 && matches.every((m) => m.state === "post");
}

/** Status of a single knockout pick. */
export function pickStatus(pick: string, round: KoRoundKey, bracket: BracketLike | null): PickStatus {
  if (!bracket) return "pending";
  const matches = (bracket.rounds[round] ?? []) as MatchLike[];
  const key = norm(pick);
  const winners = getWinners(matches);
  if (winners.has(key)) return "correct";
  const elim = getEliminated(matches);
  // Wrong if: (a) team played this round and lost, or (b) this round is fully done (team never appeared)
  if (elim.has(key) || isRoundComplete(matches)) return "wrong";
  return "pending";
}

/** Aggregate KO score for one player. */
export function computeKoScore(
  picks: Partial<Record<KoRoundKey, string[]>>,
  bracket: BracketLike | null,
): KoScore {
  let total = 0;
  const byRound: Partial<Record<KoRoundKey, RoundSummary>> = {};

  for (const round of KO_ROUNDS) {
    const roundPicks = picks[round] ?? [];
    if (roundPicks.length === 0) continue;
    const matches = bracket ? ((bracket.rounds[round] ?? []) as MatchLike[]) : [];
    const winners = getWinners(matches);
    const elim = getEliminated(matches);
    const complete = isRoundComplete(matches);

    let correct = 0;
    let pending = 0;
    for (const pick of roundPicks) {
      const key = norm(pick);
      if (winners.has(key)) {
        correct++;
      } else if (!elim.has(key) && !complete) {
        pending++;
      }
    }
    const resolved = roundPicks.length - pending;
    const pts = correct * KO_PTS[round];
    byRound[round] = { correct, resolved, pending, pts };
    total += pts;
  }

  return { byRound, total };
}
