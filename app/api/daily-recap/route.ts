import { NextResponse } from "next/server";
import { generateText } from "ai";
import matchesJson from "@/data/matches.json";
import predictionsJson from "@/data/predictions.json";
import bundledResults from "@/data/results.json";
import teamsJson from "@/data/teams.json";
import type { Match, Player, Results, ResultEntry, TeamInfo } from "@/lib/types";
import { buildRecap } from "@/lib/standings";
import { buildRecapEmail } from "@/lib/recap-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const matches = matchesJson as Match[];
const players = predictionsJson as Player[];
const teams = teamsJson as Record<string, TeamInfo>;

const REPO = process.env.GITHUB_REPO ?? "eduuusama/worldcup-2026-pool";
const BRANCH = "main";
const RESULTS_PATH = "data/results.json";
const TZ = "America/Mexico_City";
const RESULTS_MODEL = "perplexity/sonar"; // web-grounded; available on the free AI Gateway tier
const PROSE_MODEL = "perplexity/sonar"; // premium models (claude/gpt) are gated behind paid credits

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

/** Pull the first JSON value (object or array) out of an LLM response. */
function extractJson<T>(text: string): T | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) return null;
  const open = cleaned[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === open) depth++;
    else if (cleaned[i] === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]/g, "");

async function ghGetResults(token: string): Promise<{ results: Results; sha: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${RESULTS_PATH}?ref=${BRANCH}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { results: JSON.parse(content) as Results, sha: data.sha as string };
}

async function ghPutResults(token: string, results: Results, sha: string, message: string) {
  const body = {
    message,
    content: Buffer.from(JSON.stringify(results, null, 2) + "\n").toString("base64"),
    sha,
    branch: BRANCH,
    committer: { name: "Quinela Cron", email: "quinela@aiclear.org" },
  };
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${RESULTS_PATH}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT failed ${res.status}: ${await res.text()}`);
}

interface SonarMatch {
  id: number;
  scoreA: number;
  scoreB: number;
}

interface DayRecap {
  found: SonarMatch[];
  recapEs: string;
  funFactEs: string;
}

/**
 * ONE web-grounded call does everything: extract that day's final scores AND
 * write the Spanish recap + fun fact. The free AI Gateway tier rate-limits
 * back-to-back requests, and the cron only runs once a day, so a single call
 * is both necessary and sufficient.
 */
async function fetchDayRecap(day: string): Promise<DayRecap> {
  const list = matches
    .map((m) => `${m.id}: ${m.teamA} (teamA) vs ${m.teamB} (teamB) [Group ${m.group}]`)
    .join("\n");
  const prompt = `You cover the 2026 FIFA World Cup for a friendly prediction pool. Here is the full list of group-stage matches with their ids and the two teams:
${list}

TASK 1 — Results: For matches from this list that were PLAYED AND FINISHED (full-time) on ${day} (calendar date), give their final scores.
- "scoreA" = goals by the team labelled (teamA); "scoreB" = goals by (teamB). Map by TEAM NAME, never by home/away.
- Only matches you can confirm finished on ${day} with a real final score. Omit upcoming, in-progress, postponed, or unconfirmable ones.

TASK 2 — "recapEs": 2-4 sentences in SPANISH (warm, fun, Latin-American, 1-2 emojis) about the most exciting/funny/dramatic thing across those matches (a goal, red card, upset, record, fan moment). Base it ONLY on what really happened; do not invent.

TASK 3 — "funFactEs": 1-2 sentences in SPANISH with a REAL World Cup history fun fact relevant to a team or stadium that played that day.

Return STRICT JSON only, no other text:
{"matches":[{"id":<number>,"scoreA":<number>,"scoreB":<number>}],"recapEs":"<es>","funFactEs":"<es>"}
If no listed match finished on ${day}: {"matches":[],"recapEs":"","funFactEs":""}.`;

  const { text } = await generateText({ model: RESULTS_MODEL, prompt });
  const parsed = extractJson<{ matches: SonarMatch[]; recapEs?: string; funFactEs?: string }>(text);
  const valid = (parsed?.matches ?? []).filter(
    (m) =>
      Number.isInteger(m.id) &&
      matches.some((x) => x.id === m.id) &&
      Number.isFinite(m.scoreA) &&
      Number.isFinite(m.scoreB)
  );
  return {
    found: valid,
    recapEs: parsed?.recapEs?.trim() || "¡Rodó el balón en el Mundial! Revisa la tabla para ver cómo quedó todo. ⚽",
    funFactEs:
      parsed?.funFactEs?.trim() || "El Mundial 2026 es el primero con 48 selecciones y tres países anfitriones. 🌎",
  };
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

    // 2. Web-grounded: that day's finished matches + Spanish recap + fun fact (one call).
    const { found, recapEs, funFactEs } = await fetchDayRecap(day);
    log.fetched = found.length;

    // 3. Merge — only fill matches that don't already have a final outcome.
    let changed = 0;
    for (const f of found) {
      const cur = results[String(f.id)];
      if (cur?.outcome) continue;
      const outcome = f.scoreA > f.scoreB ? "1" : f.scoreA < f.scoreB ? "2" : "X";
      results[String(f.id)] = {
        outcome,
        scoreA: f.scoreA,
        scoreB: f.scoreB,
        status: "final",
        source: `AI Gateway (${RESULTS_MODEL}) web search`,
        updatedAt: day,
      } as ResultEntry;
      changed++;
    }
    log.recorded = changed;

    // 4. Persist new results so the website matches the email.
    if (changed && doCommit && token && sha) {
      await ghPutResults(token, results, sha, `chore: results for ${day} (auto)`);
      log.committed = true;
    }

    // 5. Standings + movements (same ranking the site uses).
    const recap = buildRecap(matches, players, results, day);
    const decidedTotal = Object.values(results).filter((r) => r.outcome).length;
    log.dayResults = recap.dayResults.length;

    if (recap.dayResults.length === 0) {
      return NextResponse.json({ sent: false, reason: "no matches finished on this day", ...log });
    }

    // 6. Build + send (recap prose came from the single call above).
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
