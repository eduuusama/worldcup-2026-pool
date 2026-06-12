import { NextResponse } from "next/server";
import { generateText } from "ai";
import matchesJson from "@/data/matches.json";
import predictionsJson from "@/data/predictions.json";
import bundledResults from "@/data/results.json";
import teamsJson from "@/data/teams.json";
import type { Match, Player, Results, TeamInfo } from "@/lib/types";
import { buildRecap } from "@/lib/standings";
import { buildRecapEmail } from "@/lib/recap-email";
import { ghGetResults, ghPutResults, extractJson, validPlayed, recordPlayed } from "@/lib/results-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = matchesJson as Match[];
const players = predictionsJson as Player[];
const teams = teamsJson as Record<string, TeamInfo>;

const TZ = "America/Mexico_City";
const RESULTS_MODEL = "perplexity/sonar"; // web-grounded; available on the free AI Gateway tier

// ---- helpers ---------------------------------------------------------------

function isoDateInTz(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function yesterdayIso(): string {
  const today = isoDateInTz(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dateLabelEs(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(d)
    .replace(",", "");
}

interface DayRecap {
  played: ReturnType<typeof validPlayed>;
  momentEs: string; // AI flavour: the dramatic moment — NOT a winner/score statement
  funFactEs: string;
}

/**
 * ONE web-grounded call does everything: REPORT the matches actually played so
 * far (open-world — reliable, no hallucination) AND write the colour commentary +
 * fun fact for `day`. Results are mapped to our fixtures in code; the AI is never
 * handed the fixture list to "confirm" (that primes confabulation) and is never
 * asked who won (it inverts scorelines — winners are rendered by winnerSummaryEs).
 *
 * The free AI Gateway tier rate-limits back-to-back requests and the cron runs
 * once a day, so a single combined call is both necessary and sufficient.
 */
async function fetchDayRecap(day: string, today: string): Promise<DayRecap> {
  const prompt = `You cover the 2026 FIFA World Cup for a friendly prediction pool. Today is ${today}.

TASK 1 — Results: List ONLY the 2026 FIFA World Cup matches that have ALREADY kicked off and reached a FINAL full-time score so far in the entire tournament. For each: home team, away team, the final score for each, and the date played (YYYY-MM-DD). Do NOT include any match not yet played or scheduled for a future date.

TASK 2 — "momentEs": ONE or TWO sentences in SPANISH (warm, fun, Latin-American, 1-2 emojis) about the single most dramatic or funny MOMENT among the matches played specifically on ${day} (a golazo, a red card, an upset, a record, a fan moment). Use Spanish team names (México, Corea del Sur, Chequia, Sudáfrica, etc.). Describe the EVENT only — do NOT state final scores and do NOT say who won or lost. Base it strictly on what really happened. If no match was played on ${day}, use "".

TASK 3 — "funFactEs": 1-2 sentences in SPANISH with a REAL World Cup history fun fact relevant to a team or stadium that played on ${day}.

Return STRICT JSON only, no other text:
{"played":[{"home":"<team>","away":"<team>","homeScore":<n>,"awayScore":<n>,"date":"YYYY-MM-DD"}],"momentEs":"<es>","funFactEs":"<es>"}`;

  const { text } = await generateText({ model: RESULTS_MODEL, prompt });
  const parsed = extractJson<{ played: unknown; momentEs?: string; funFactEs?: string }>(text);
  return {
    played: validPlayed(parsed?.played, today),
    momentEs: parsed?.momentEs?.trim() || "",
    funFactEs:
      parsed?.funFactEs?.trim() || "El Mundial 2026 es el primero con 48 selecciones y tres países anfitriones. 🌎",
  };
}

/** Deterministic, always-correct "who beat whom" summary in Spanish (winner first). */
function winnerSummaryEs(recap: { dayResults: { teamA: string; teamB: string; scoreA: number | null; scoreB: number | null; outcome: "1" | "X" | "2" }[] }): string {
  const fmt = (name: string) => {
    const t = teams[name];
    return { label: t ? t.es : name, flag: t ? t.flag : "🏳️" };
  };
  return recap.dayResults
    .map((r) => {
      const a = fmt(r.teamA);
      const b = fmt(r.teamB);
      const sa = r.scoreA ?? 0;
      const sb = r.scoreB ?? 0;
      if (r.outcome === "1") return `${a.flag} <strong>${a.label}</strong> venció ${sa}-${sb} a ${b.flag} ${b.label}`;
      if (r.outcome === "2") return `${b.flag} <strong>${b.label}</strong> venció ${sb}-${sa} a ${a.flag} ${a.label}`;
      return `${a.flag} ${a.label} y ${b.flag} ${b.label} empataron ${sa}-${sb}`;
    })
    .join(" · ");
}

async function sendEmail(to: string[], subject: string, html: string): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Gran Quinela Mundialista <quinela@aiclear.org>", to, subject, html }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(body)}`);
  return body.id ?? "ok";
}

// ---- handler ---------------------------------------------------------------

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const keyParam = url.searchParams.get("key");
  if (secret && auth !== `Bearer ${secret}` && keyParam !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const day = url.searchParams.get("date") ?? yesterdayIso();
  const today = isoDateInTz(new Date());
  const dry = url.searchParams.get("dry") === "1";
  const doCommit = url.searchParams.get("commit") !== "0";
  const toOverride = url.searchParams.get("to");
  const recipients = toOverride
    ? toOverride.split(",").map((s) => s.trim())
    : (process.env.RECIPIENTS ?? "esamayoam1@gmail.com,kikewalsh@gmail.com").split(",").map((s) => s.trim());

  const log: Record<string, unknown> = { day, dry, doCommit };

  try {
    // 1. Base results: prefer the freshest copy from GitHub (also gives us the sha for committing).
    const token = process.env.GITHUB_TOKEN;
    let results: Results = JSON.parse(JSON.stringify(bundledResults)) as Results;
    let sha: string | null = null;
    if (token) {
      const gh = await ghGetResults(token);
      if (gh) {
        results = gh.results;
        sha = gh.sha;
      }
    }

    // 2. Web-grounded: matches actually played (open-world) + drama + fun fact (one call).
    const { played, momentEs, funFactEs } = await fetchDayRecap(day, today);
    log.fetched = played.length;

    // 3. Map reported results onto our fixtures and fill any still pending.
    const recorded = recordPlayed(results, played, matches, `AI Gateway (${RESULTS_MODEL}) web search`);
    log.recorded = recorded.length;

    // 4. Persist new results so the website matches the email. NON-FATAL: a GitHub
    //    hiccup must never block the email (computed in-memory from the same data).
    if (recorded.length && doCommit && token && sha) {
      try {
        await ghPutResults(token, results, sha, `chore: results for ${day} (auto)`);
        log.committed = true;
      } catch (e) {
        console.error("[daily-recap] commit failed (non-fatal):", e);
        log.commitError = String(e);
      }
    }

    // 5. Standings + movements (same ranking the site uses).
    const recap = buildRecap(matches, players, results, day);
    const decidedTotal = Object.values(results).filter((r) => r.outcome).length;
    log.dayResults = recap.dayResults.length;

    if (recap.dayResults.length === 0) {
      return NextResponse.json({ sent: false, reason: "no matches finished on this day", ...log });
    }

    // 6. Recap text = deterministic winner summary (always correct) + AI drama flavour.
    const summary = winnerSummaryEs(recap);
    const recapEs = momentEs ? `${summary}. ${momentEs}` : `${summary}.`;

    // 7. Build + send.
    const { subjectHint, html } = buildRecapEmail({
      recap,
      recapEs,
      funFactEs,
      teams,
      dateLabelEs: dateLabelEs(day),
      decided: decidedTotal,
      totalMatches: matches.length,
    });
    const dayNum = new Date(`${day}T12:00:00Z`).getUTCDate();
    const subject = `⚽ Quinela Mundialista — Resumen ${dayNum} jun: ${subjectHint}`;

    if (url.searchParams.get("raw") === "1") {
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (dry) {
      return NextResponse.json({ sent: false, dry: true, subject, recipients, recapEs, funFactEs, ...log });
    }

    const id = await sendEmail(recipients, subject, html);
    return NextResponse.json({ sent: true, id, subject, recipients, ...log });
  } catch (err) {
    console.error("[daily-recap]", err);
    return NextResponse.json({ error: String(err), ...log }, { status: 500 });
  }
}
