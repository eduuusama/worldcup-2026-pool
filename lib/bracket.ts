import teamsJson from "@/data/teams.json";
import type { TeamInfo } from "./types";
import { canon } from "./results-sync";

/**
 * Knockout bracket, fetched and normalized from ESPN's public scoreboard.
 *
 * ESPN encodes the whole tree: each match is numbered (by event-id order within
 * its round), and later-round fixtures reference earlier ones as placeholder
 * "teams" — e.g. "Round of 32 1 Winner", "Semifinal 2 Loser". We parse those into
 * topology refs so the UI can draw the tree; ESPN swaps in the real team once a
 * match finishes, so the bracket fills itself in.
 */

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

export type RoundKey = "R32" | "R16" | "QF" | "SF" | "BRONZE" | "FINAL";

// Fixed FIFA schedule (America-hosted WC opens these knockout dates).
const ROUND_DATES: Record<RoundKey, string[]> = {
  R32: ["20260628", "20260629", "20260630", "20260701", "20260702", "20260703"],
  R16: ["20260704", "20260705", "20260706", "20260707"],
  QF: ["20260709", "20260710", "20260711", "20260712"],
  SF: ["20260714", "20260715"],
  BRONZE: ["20260718"],
  FINAL: ["20260719"],
};

const teams = teamsJson as Record<string, TeamInfo>;
const canonToKey: Record<string, string> = {};
for (const key of Object.keys(teams)) canonToKey[canon(key)] = key;

export interface Ref {
  round: RoundKey;
  num: number;
  kind: "W" | "L";
}

export interface BracketSide {
  teamKey: string | null; // teams.json key when resolved to a real team
  abbr: string | null;
  score: number | null;
  winner: boolean;
  ref: Ref | null; // set when this side is still a placeholder
}

export interface BracketMatch {
  id: string;
  round: RoundKey;
  num: number; // 1-based within the round
  date: string; // ISO UTC kickoff
  venue: string | null;
  state: "pre" | "in" | "post";
  home: BracketSide;
  away: BracketSide;
}

export interface Bracket {
  rounds: Record<RoundKey, BracketMatch[]>;
  updatedAt: string;
}

const REF_RE = /^(Round of 32|Round of 16|Quarterfinal|Semifinal)\s+(\d+)\s+(Winner|Loser)$/i;
const REF_ROUND: Record<string, RoundKey> = {
  "round of 32": "R32",
  "round of 16": "R16",
  quarterfinal: "QF",
  semifinal: "SF",
};

function parseSide(competitor: {
  team?: { displayName?: string; abbreviation?: string };
  score?: string;
  winner?: boolean;
}): BracketSide {
  const name = competitor.team?.displayName ?? "";
  const m = name.match(REF_RE);
  if (m) {
    return {
      teamKey: null,
      abbr: null,
      score: null,
      winner: false,
      ref: { round: REF_ROUND[m[1].toLowerCase()], num: parseInt(m[2], 10), kind: m[3].toLowerCase() === "loser" ? "L" : "W" },
    };
  }
  const key = canonToKey[canon(name)] ?? null;
  const scoreNum = competitor.score != null && competitor.score !== "" ? parseInt(competitor.score, 10) : null;
  return {
    teamKey: key,
    abbr: competitor.team?.abbreviation ?? null,
    score: Number.isFinite(scoreNum as number) ? (scoreNum as number) : null,
    winner: !!competitor.winner,
    ref: null,
  };
}

async function fetchDate(date: string) {
  const res = await fetch(`${ESPN}?dates=${date}`, { cache: "no-store" });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.events ?? []) as Array<Record<string, unknown>>;
}

export async function fetchBracket(): Promise<Bracket> {
  const rounds = {} as Record<RoundKey, BracketMatch[]>;

  await Promise.all(
    (Object.keys(ROUND_DATES) as RoundKey[]).map(async (round) => {
      const lists = await Promise.all(ROUND_DATES[round].map(fetchDate));
      const events = lists.flat();
      events.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      rounds[round] = events.map((ev, i) => {
        const comp = (ev as { competitions?: Array<Record<string, unknown>> }).competitions?.[0] ?? {};
        const competitors = (comp.competitors as Array<{ homeAway: string }>) ?? [];
        const home = competitors.find((c) => c.homeAway === "home") ?? {};
        const away = competitors.find((c) => c.homeAway === "away") ?? {};
        const status = (comp.status as { type?: { state?: string } })?.type?.state ?? "pre";
        const venue = (comp.venue as { fullName?: string; address?: { city?: string } }) ?? null;
        return {
          id: String(ev.id),
          round,
          num: i + 1,
          date: String(ev.date ?? ""),
          venue: venue ? [venue.fullName, venue.address?.city].filter(Boolean).join(" · ") : null,
          state: (status === "post" || status === "in" ? status : "pre") as "pre" | "in" | "post",
          home: parseSide(home),
          away: parseSide(away),
        };
      });
    })
  );

  return { rounds, updatedAt: new Date().toISOString() };
}
