import { NextResponse } from "next/server";
import { generateText } from "ai";
import matchesJson from "@/data/matches.json";
import predictionsJson from "@/data/predictions.json";
import bundledResults from "@/data/results.json";
import teamsJson from "@/data/teams.json";
import type { Match, Player, Results, TeamInfo } from "@/lib/types";
import { leaderboard } from "@/lib/scoring";
import { ghGetResults, ghPutResults, extractJson, validPlayed, recordPlayed } from "@/lib/results-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = matchesJson as Match[];
const players = predictionsJson as Player[];
const teams = teamsJson as Record<string, TeamInfo>;
const MODEL = "perplexity/sonar"; // web-grounded; free AI Gateway tier
const TZ = "America/Mexico_City";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Open-world: ask the web to REPORT which matches have actually been played. */
async function fetchPlayed(today: string) {
  const prompt = `Today is ${today}. List ONLY the 2026 FIFA World Cup matches that have ALREADY kicked off and reached a FINAL full-time score so far in the entire tournament. For each give: home team, away team, the final score for each, and the date played (YYYY-MM-DD). Do NOT list any match that has not been played yet or is scheduled for a future date. Be accurate; if a match is still upcoming, omit it.

Return STRICT JSON only: {"played":[{"home":"<team>","away":"<team>","homeScore":<n>,"awayScore":<n>,"date":"YYYY-MM-DD"}]}`;

  const { text } = await generateText({ model: MODEL, prompt });
  const parsed = extractJson<{ played: unknown }>(text);
  return validPlayed(parsed?.played, today);
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
    const recorded = recordPlayed(results, played, matches, `Manual update (${MODEL} web search)`);

    // Persist so every visitor (and the email) sees it. Non-fatal on failure —
    // the caller still gets the fresh results to render immediately.
    let committed = false;
    if (recorded.length && token && sha && !dry) {
      try {
        await ghPutResults(token, results, sha, `chore: results update via site button (${today})`);
        committed = true;
      } catch (e) {
        console.error("[update-scores] commit failed (non-fatal):", e);
      }
    }

    const decided = Object.values(results).filter((r) => r.outcome).length;
    const board = leaderboard(players, matches, results);
    const items = recorded.map((it) => ({
      ...it,
      teamAEs: teams[it.teamA]?.es ?? it.teamA,
      teamBEs: teams[it.teamB]?.es ?? it.teamB,
      flagA: teams[it.teamA]?.flag ?? "🏳️",
      flagB: teams[it.teamB]?.flag ?? "🏳️",
    }));

    return NextResponse.json({
      updated: recorded.length,
      items,
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
