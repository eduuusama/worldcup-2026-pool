import { NextResponse } from "next/server";
import matchesJson from "@/data/matches.json";
import predictionsJson from "@/data/predictions.json";
import bundledResults from "@/data/results.json";
import teamsJson from "@/data/teams.json";
import type { Match, Player, Results, TeamInfo } from "@/lib/types";
import { leaderboard } from "@/lib/scoring";
import { ghGetResults, ghPutResults, fetchEspnPlayed, datesFrom, recordPlayed } from "@/lib/results-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = matchesJson as Match[];
const players = predictionsJson as Player[];
const teams = teamsJson as Record<string, TeamInfo>;
const TZ = "America/Mexico_City";
const TOURNAMENT_START = "2026-06-11";

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  // Soft guard: only accept calls from our own UI. Not a security boundary.
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

    // Live, authoritative results from ESPN across the whole tournament window.
    const today = todayIso();
    const played = await fetchEspnPlayed(datesFrom(TOURNAMENT_START, today));
    const recorded = recordPlayed(results, played, matches, "ESPN scoreboard");

    // Persist so every visitor (and the email) sees it. Non-fatal on failure.
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
    console.error("[update-scores]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
