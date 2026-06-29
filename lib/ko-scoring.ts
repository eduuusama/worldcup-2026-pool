/**
 * Scoring for the knockout-stage bracket pool.
 * Each player submits one pick per match (which team wins).
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

export interface KoPickMatch {
  teamA: string;  // teams.json key (left/home team)
  teamB: string;  // teams.json key (right/away team)
  pick: string;   // teams.json key of picked winner
  round: KoRoundKey;
  pts: number;
}

export type KoPicks = Record<string, Record<string, KoPickMatch>>;

export type PickStatus = "correct" | "wrong" | "pending";

export interface RoundSummary {
  correct: number;
  resolved: number; // correct + wrong (outcome known)
  pending: number;
  pts: number;
}

export interface KoScore {
  byRound: Partial<Record<KoRoundKey, RoundSummary>>;
  total: number;
}

// Mirrors the shape of /api/bracket response — no server imports needed.
// The bracket is keyed by FIFA match id; each match carries its round.
interface Side { teamKey: string | null; winner: boolean }
interface MatchLike { round: string; state: "pre" | "in" | "post"; home: Side; away: Side }
export interface BracketLike { matches: Record<string, MatchLike> }

/** All matches in a given round (R32/R16/QF/SF/FINAL). */
function roundMatches(bracket: BracketLike | null, round: KoRoundKey): MatchLike[] {
  if (!bracket?.matches) return [];
  return Object.values(bracket.matches).filter((m) => m.round === round);
}

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

/** Status of a single knockout pick (checked against round winners). */
export function pickStatus(pick: string, round: KoRoundKey, bracket: BracketLike | null): PickStatus {
  if (!bracket) return "pending";
  const matches = roundMatches(bracket, round);
  const key = norm(pick);
  if (getWinners(matches).has(key)) return "correct";
  if (getEliminated(matches).has(key) || isRoundComplete(matches)) return "wrong";
  return "pending";
}

/** Aggregate KO score for one player from per-match picks. */
export function computeKoScore(
  playerMatches: Record<string, KoPickMatch>,
  bracket: BracketLike | null,
): KoScore {
  // Group picks by round
  const byRoundPicks: Partial<Record<KoRoundKey, string[]>> = {};
  for (const m of Object.values(playerMatches)) {
    if (!byRoundPicks[m.round]) byRoundPicks[m.round] = [];
    byRoundPicks[m.round]!.push(m.pick);
  }

  let total = 0;
  const byRound: Partial<Record<KoRoundKey, RoundSummary>> = {};

  for (const round of KO_ROUNDS) {
    const picks = byRoundPicks[round] ?? [];
    if (picks.length === 0) continue;

    const matches = roundMatches(bracket, round);
    const winners = getWinners(matches);
    const elim = getEliminated(matches);
    const complete = isRoundComplete(matches);

    let correct = 0;
    let pending = 0;
    for (const pick of picks) {
      const key = norm(pick);
      if (winners.has(key)) correct++;
      else if (!elim.has(key) && !complete) pending++;
    }
    const resolved = picks.length - pending;
    const pts = correct * KO_PTS[round];
    byRound[round] = { correct, resolved, pending, pts };
    total += pts;
  }

  return { byRound, total };
}
