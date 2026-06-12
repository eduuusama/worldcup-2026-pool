import { NextResponse } from "next/server";
import { generateText } from "ai";
import matchesJson from "@/data/matches.json";
import predictionsJson from "@/data/predictions.json";
import bundledResults from "@/data/results.json";
import teamsJson from "@/data/teams.json";
import type { Match, Player, Results, ResultEntry, TeamInfo } from "@/lib/types";
import { leaderboard } from "@/lib/scoring";
import { ghGetResults, ghPutResults, extractJson } from "@/lib/results-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = matchesJson as Match[];
const players = predictionsJson as Player[];
const teams = teamsJson as Record<string, TeamInfo>;
const MODEL = "perplexity/sonar"; // web-grounded; free AI Gateway tier
const TZ = "America/Mexico_City";

/**
 * Map common name variants the model returns onto our canonical (normalized)
 * team names. Keyed by normalized variant -> normalized canonical.
 */
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

function canon(name: string): string {
  const n = String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]/g, "");
  return ALIASES[n] ?? n;
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface Played {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  date: string;
}

/**
 * Open-world query: ask the web to REPORT which matches have actually been
 * played so far (with scores + dates). This is reliable — handing the model the
 * full fixture list and asking "which of these were played?" instead makes it
 * confabulate plausible results for games that haven't happened. So we never do
 * that; we ask it to report reality, then match those results to our fixtures by
 * team name in code.
 */
async function fetchPlayed(today: string): Promise<Played[]> {
  const prompt = `Today is ${today}. List ONLY the 2026 FIFA World Cup matches that have ALREADY kicked off and reached a FINAL full-time score so far in the entire tournament. For each give: home team, away team, the final score for each, and the date played (YYYY-MM-DD). Do NOT list any match that has not been played yet or is scheduled for a future date. Be accurate; if a match is still upcoming, omit it.

Return STRICT JSON only: {"played":[{"home":"<team>","away":"<team>","homeScore":<n>,"awayScore":<n>,"date":"YYYY-MM-DD"}]}`;

  const { text } = await generateText({ model: MODEL, prompt });
  const parsed = extractJson<{ played: Played[] }>(text);
  return (parsed?.played ?? []).filter(
    (p) =>
      p &&
      typeof p.home === "string" &&
      typeof p.away === "string" &&
      Number.isFinite(p.homeScore) &&
      Number.isFinite(p.awayScore) &&
      typeof p.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
      p.date <= today // backstop: never accept a future-dated result
  );
}

export async function POST(req: Request) {
  // Soft guard: only accept calls from our own UI (deters drive-by abuse of the
  // web-search + commit endpoint). Not a security boundary — the data is public.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (req.headers.get("x-quinela-update") !== "1") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1"; // test: fetch but don't commit

  try {
    const token = process.env.GITHUB_TOKEN;

    // Base = freshest results from GitHub (also yields the sha for committing).
    let results: Results = JSON.parse(JSON.stringify(bundledResults)) as Results;
    let sha: string | null = null;
    if (token) {
      const gh = await ghGetResults(token);
      if (gh) {
        results = gh.results;
        sha = gh.sha;
      }
    }

    const today = todayIso();
    const played = await fetchPlayed(today);

    // Index our fixtures by unordered team pair (each pair is unique in the group stage).
    const byPair = new Map<string, Match>();
    for (const m of matches) byPair.set([canon(m.teamA), canon(m.teamB)].sort().join("|"), m);

    const items: { id: number; teamA: string; teamB: string; scoreA: number; scoreB: number; outcome: string }[] = [];
    for (const p of played) {
      const match = byPair.get([canon(p.home), canon(p.away)].sort().join("|"));
      if (!match || results[String(match.id)]?.outcome) continue;
      // Re-orient the reported score onto our teamA / teamB.
      const homeIsA = canon(p.home) === canon(match.teamA);
      const scoreA = homeIsA ? p.homeScore : p.awayScore;
      const scoreB = homeIsA ? p.awayScore : p.homeScore;
      const outcome = scoreA > scoreB ? "1" : scoreA < scoreB ? "2" : "X";
      results[String(match.id)] = {
        outcome,
        scoreA,
        scoreB,
        status: "final",
        source: `Manual update (${MODEL} web search)`,
        updatedAt: p.date,
      } as ResultEntry;
      items.push({ id: match.id, teamA: match.teamA, teamB: match.teamB, scoreA, scoreB, outcome });
    }

    // Persist so every visitor (and the email) sees it. Non-fatal on failure —
    // the caller still gets the fresh results to render immediately.
    let committed = false;
    if (items.length && token && sha && !dry) {
      try {
        await ghPutResults(token, results, sha, `chore: results update via site button (${today})`);
        committed = true;
      } catch (e) {
        console.error("[update-scores] commit failed (non-fatal):", e);
      }
    }

    const decided = Object.values(results).filter((r) => r.outcome).length;
    const board = leaderboard(players, matches, results);
    const localized = items.map((it) => ({
      ...it,
      teamAEs: teams[it.teamA]?.es ?? it.teamA,
      teamBEs: teams[it.teamB]?.es ?? it.teamB,
      flagA: teams[it.teamA]?.flag ?? "🏳️",
      flagB: teams[it.teamB]?.flag ?? "🏳️",
    }));

    return NextResponse.json({
      updated: items.length,
      items: localized,
      committed,
      decided,
      total: matches.length,
      results,
      leaderTop: board.slice(0, 3).map((p) => ({ name: p.name, points: p.points })),
    });
  } catch (err) {
    const msg = String(err);
    const rateLimited = /rate.?limit|429/i.test(msg);
    console.error("[update-scores]", err);
    return NextResponse.json({ error: rateLimited ? "rate_limited" : msg }, { status: rateLimited ? 429 : 500 });
  }
}
