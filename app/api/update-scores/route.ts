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

interface Found {
  id: number;
  scoreA: number;
  scoreB: number;
  date: string; // real YYYY-MM-DD the match was played
}

/**
 * Ask the web which matches finished on a SPECIFIC recent date (yesterday or
 * today). Anchoring to concrete real dates is the anti-hallucination guard: the
 * model reliably knows the true fixture list for "June 12" and won't claim a
 * matchday-2 game (really days away) happened then. The open-ended "which of
 * these 70 pending matches have been played?" question, by contrast, tempts it
 * to confabulate plausible scores+dates — so we never ask that.
 *
 * We then strictly reject any result whose date is outside the queried window.
 */
async function fetchFinished(pending: Match[], dates: string[]): Promise<Found[]> {
  if (pending.length === 0) return [];
  const list = pending.map((m) => `${m.id}: ${m.teamA} (teamA) vs ${m.teamB} (teamB)`).join("\n");
  const window = dates.join(" or ");
  const prompt = `You track 2026 FIFA World Cup results. Here are matches NOT yet recorded:
${list}

Which of THESE EXACT matchups were actually PLAYED and FINISHED (full-time final score) specifically on ${window}?
- "scoreA" = goals by the team labelled (teamA); "scoreB" = goals by (teamB). Map by TEAM NAME, never by home/away.
- "date" = the real calendar date the match was played, as YYYY-MM-DD; it MUST be exactly ${window}.
- ONLY include a match that genuinely kicked off and finished on one of those exact dates. Do NOT include matches scheduled for any other day, do NOT guess, and never attribute a team's result against a different opponent to this matchup. When unsure, omit it.

Return STRICT JSON only: {"matches":[{"id":<number>,"scoreA":<number>,"scoreB":<number>,"date":"YYYY-MM-DD"}]}
If no listed matchup was played on ${window}, return {"matches":[]}.`;

  const { text } = await generateText({ model: MODEL, prompt });
  const parsed = extractJson<{ matches: Found[] }>(text);
  return (parsed?.matches ?? []).filter(
    (m) =>
      Number.isInteger(m.id) &&
      pending.some((x) => x.id === m.id) &&
      Number.isFinite(m.scoreA) &&
      Number.isFinite(m.scoreB) &&
      typeof m.date === "string" &&
      dates.includes(m.date) // strictly within the queried window
  );
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The recent window the button looks at: yesterday + today (local). */
function recentDates(): string[] {
  const today = todayIso();
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const yesterday = d.toISOString().slice(0, 10);
  return [yesterday, today];
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

    const dates = recentDates();
    const pending = matches.filter((m) => !results[String(m.id)]?.outcome);
    const found = await fetchFinished(pending, dates);

    const items: { id: number; teamA: string; teamB: string; scoreA: number; scoreB: number; outcome: string }[] = [];
    for (const f of found) {
      const match = matches.find((m) => m.id === f.id);
      if (!match || results[String(f.id)]?.outcome) continue;
      const outcome = f.scoreA > f.scoreB ? "1" : f.scoreA < f.scoreB ? "2" : "X";
      results[String(f.id)] = {
        outcome,
        scoreA: f.scoreA,
        scoreB: f.scoreB,
        status: "final",
        source: `Manual update (${MODEL} web search)`,
        updatedAt: f.date, // the real date played (drives email day-grouping)
      } as ResultEntry;
      items.push({ id: f.id, teamA: match.teamA, teamB: match.teamB, scoreA: f.scoreA, scoreB: f.scoreB, outcome });
    }

    // Persist so every visitor (and the email) sees it. Non-fatal on failure —
    // the caller still gets the fresh results to render immediately.
    let committed = false;
    if (items.length && token && sha) {
      try {
        await ghPutResults(token, results, sha, `chore: results update via site button (${dates[1]})`);
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
    return NextResponse.json(
      { error: rateLimited ? "rate_limited" : msg },
      { status: rateLimited ? 429 : 500 }
    );
  }
}
