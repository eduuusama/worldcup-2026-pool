import { NextResponse } from "next/server";
import { generateText } from "ai";
import matchesJson from "@/data/matches.json";
import predictionsJson from "@/data/predictions.json";
import bundledResults from "@/data/results.json";
import teamsJson from "@/data/teams.json";
import type { Match, Player, Results, TeamInfo } from "@/lib/types";
import { buildRecap, type RecapData } from "@/lib/standings";
import { buildRecapEmail } from "@/lib/recap-email";
import { ghGetResults, ghPutResults, extractJson, fetchEspnPlayed, datesFrom, recordPlayed } from "@/lib/results-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = matchesJson as Match[];
const players = predictionsJson as Player[];
const teams = teamsJson as Record<string, TeamInfo>;

const TZ = "America/Mexico_City";
const TOURNAMENT_START = "2026-06-11";
const PROSE_MODEL = "perplexity/sonar"; // web-grounded; free AI Gateway tier

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

/** Deterministic, always-correct "who beat whom" summary in Spanish (winner first). */
function winnerSummaryEs(recap: RecapData): string {
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

/**
 * The drama line + fun fact for the email (Spanish). Results already come from
 * ESPN, so this single AI call only writes colour commentary — and is never told
 * who won (it inverts scorelines; winners are rendered by winnerSummaryEs).
 */
async function fetchProse(day: string, recap: RecapData): Promise<{ momentEs: string; funFactEs: string }> {
  const games = recap.dayResults
    .map((r) => `${teams[r.teamA]?.es ?? r.teamA} vs ${teams[r.teamB]?.es ?? r.teamB}`)
    .join("; ");
  const prompt = `Cubres el Mundial 2026 para una quiniela entre amigos. El ${day} se jugaron estos partidos: ${games}.

TASK 1 — "momentEs": 1-2 frases en ESPAÑOL (cálido, divertido, 1-2 emojis) sobre el momento más dramático o divertido de esos partidos (un golazo, una tarjeta roja, una sorpresa, un récord, un momento de la afición). Describe el EVENTO; NO menciones el marcador final ni quién ganó. Básate en lo que de verdad pasó.
TASK 2 — "funFactEs": 1-2 frases en ESPAÑOL con un dato curioso REAL de la historia de los Mundiales, relevante a algún equipo o sede que jugó ese día.

Devuelve SOLO JSON: {"momentEs":"<es>","funFactEs":"<es>"}`;

  try {
    const { text } = await generateText({ model: PROSE_MODEL, prompt });
    const parsed = extractJson<{ momentEs?: string; funFactEs?: string }>(text);
    return {
      momentEs: parsed?.momentEs?.trim() || "",
      funFactEs:
        parsed?.funFactEs?.trim() || "El Mundial 2026 es el primero con 48 selecciones y tres países anfitriones. 🌎",
    };
  } catch {
    return { momentEs: "", funFactEs: "El Mundial 2026 es el primero con 48 selecciones y tres países anfitriones. 🌎" };
  }
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

    // 2. Live results from ESPN; map onto our fixtures and fill any still pending.
    const played = await fetchEspnPlayed(datesFrom(TOURNAMENT_START, today));
    const recorded = recordPlayed(results, played, matches, "ESPN scoreboard");
    log.fetched = played.length;
    log.recorded = recorded.length;

    // 3. Persist new results so the website matches the email. NON-FATAL.
    if (recorded.length && doCommit && token && sha) {
      try {
        await ghPutResults(token, results, sha, `chore: results for ${day} (auto)`);
        log.committed = true;
      } catch (e) {
        console.error("[daily-recap] commit failed (non-fatal):", e);
        log.commitError = String(e);
      }
    }

    // 4. Standings + movements (same ranking the site uses).
    const recap = buildRecap(matches, players, results, day);
    const decidedTotal = Object.values(results).filter((r) => r.outcome).length;
    log.dayResults = recap.dayResults.length;

    if (recap.dayResults.length === 0) {
      return NextResponse.json({ sent: false, reason: "no matches finished on this day", ...log });
    }

    // 5. Recap text = deterministic winner summary (always correct) + AI drama flavour.
    const { momentEs, funFactEs } = await fetchProse(day, recap);
    const summary = winnerSummaryEs(recap);
    const recapEs = momentEs ? `${summary}. ${momentEs}` : `${summary}.`;

    // 6. Build + send.
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
