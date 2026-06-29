"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { koPicks, players, teamInfo } from "@/lib/data";
import { useLang } from "@/lib/i18n";

// ── Live bracket shape (mirrors /api/bracket) ────────────────────────────────
type RoundKey = "R32" | "R16" | "QF" | "SF" | "BRONZE" | "FINAL";
interface Side { teamKey: string | null; score: number | null; winner: boolean }
interface BracketMatch {
  id: number;
  round: RoundKey;
  date: string;
  state: "pre" | "in" | "post";
  home: Side;
  away: Side;
}
interface Bracket { matches: Record<string, BracketMatch>; updatedAt: string }

// Round metadata derived from the FIFA match id (no bracket fetch needed).
function roundOf(id: number): { key: RoundKey; labelKey: "round_r32" | "round_r16" | "round_qf" | "round_sf" | "round_bronze" | "round_final"; pts: number } {
  if (id <= 88) return { key: "R32", labelKey: "round_r32", pts: 10 };
  if (id <= 96) return { key: "R16", labelKey: "round_r16", pts: 20 };
  if (id <= 100) return { key: "QF", labelKey: "round_qf", pts: 40 };
  if (id <= 102) return { key: "SF", labelKey: "round_sf", pts: 80 };
  if (id === 104) return { key: "BRONZE", labelKey: "round_bronze", pts: 0 };
  return { key: "FINAL", labelKey: "round_final", pts: 160 };
}

function fmtKickoff(iso: string, lang: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/El_Salvador",
  }).format(d);
}

export default function KoMatchDetailPage() {
  const { t, lang } = useLang();
  const params = useParams();
  const id = String(params.id);
  const idNum = Number(id);
  const [bracket, setBracket] = useState<Bracket | null>(null);

  useEffect(() => {
    fetch("/api/bracket")
      .then((r) => r.json())
      .then((d) => { if (d?.matches) setBracket(d); })
      .catch(() => {});
  }, []);

  const meta = roundOf(idNum);
  const live = bracket?.matches[id] ?? null;

  // Group every participant by the team they picked to win this match.
  const byTeam = new Map<string, typeof players>();
  for (const p of players) {
    const pick = koPicks[p.slug]?.[id]?.pick;
    if (!pick) continue;
    if (!byTeam.has(pick)) byTeam.set(pick, []);
    byTeam.get(pick)!.push(p);
  }
  const pickGroups = [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length);

  // Actual winner (when the match has finished) — to highlight the right group.
  const winnerKey =
    live?.state === "post"
      ? (live.home.winner ? live.home.teamKey : live.away.winner ? live.away.teamKey : null)
      : null;

  // Header teams: live teams when known, otherwise null (TBD).
  const homeKey = live?.home.teamKey ?? null;
  const awayKey = live?.away.teamKey ?? null;
  const a = homeKey ? teamInfo(homeKey, lang) : null;
  const b = awayKey ? teamInfo(awayKey, lang) : null;
  const decided = live?.state === "post";
  const kickoff = live ? fmtKickoff(live.date, lang) : null;

  return (
    <div className="space-y-5">
      <Link href="/bracket" className="text-sm text-[var(--muted)] hover:text-white transition-colors inline-block">
        ← {t("nav_bracket")}
      </Link>

      {/* Scoreline / header */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[var(--muted)] uppercase tracking-wider">{t(meta.labelKey)}</span>
          {meta.pts > 0 && (
            <span className="text-xs font-bold text-[var(--accent)] tnum">
              {meta.pts} {t("col_points").toLowerCase()}
            </span>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right min-w-0">
            <div className="text-2xl leading-none">{a?.flag ?? "🏳️"}</div>
            <div className={`font-semibold mt-1 truncate ${a ? "" : "text-[var(--muted)]"}`}>
              {a?.name ?? t("tbd")}
            </div>
          </div>
          <div className="text-center px-2">
            {decided ? (
              <div className="text-3xl font-bold tnum leading-none">
                {live?.home.score ?? ""}<span className="text-[var(--muted)] mx-1">–</span>{live?.away.score ?? ""}
              </div>
            ) : (
              <div className="text-lg font-semibold text-[var(--muted)]">vs</div>
            )}
            <div className="mt-2 text-[10px] uppercase tracking-wider">
              {decided ? (
                <span className="text-[var(--accent)]">{t("match_final")}</span>
              ) : (
                <span className="text-[var(--muted)]">{t("result_pending")}</span>
              )}
            </div>
          </div>
          <div className="text-left min-w-0">
            <div className="text-2xl leading-none">{b?.flag ?? "🏳️"}</div>
            <div className={`font-semibold mt-1 truncate ${b ? "" : "text-[var(--muted)]"}`}>
              {b?.name ?? t("tbd")}
            </div>
          </div>
        </div>
        {kickoff && (
          <div className="mt-4 pt-4 border-t border-[var(--line)] flex items-center gap-2 text-sm">
            <span className="text-base shrink-0">🕐</span>
            <span className="first-letter:uppercase">{kickoff}</span>
          </div>
        )}
      </section>

      {/* Participants' picks — grouped by the team they predicted to advance */}
      <section className="space-y-3">
        <h2 className="font-semibold text-sm px-1">{t("ko_who_picked")}</h2>
        {pickGroups.length === 0 ? (
          <div className="card p-6 text-center text-sm text-[var(--muted)]">{t("ko_no_picks")}</div>
        ) : (
          pickGroups.map(([teamKey, list]) => {
            const info = teamInfo(teamKey, lang);
            const isWinner = decided && winnerKey === teamKey;
            const isOut = decided && winnerKey != null && winnerKey !== teamKey;
            return (
              <div
                key={teamKey}
                className={`card overflow-hidden ${isWinner ? "ring-1 ring-[var(--accent)]" : isOut ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--line)] bg-white/[0.02]">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <span className="text-base leading-none">{info.flag}</span>
                    {info.name}
                    {isWinner && <span className="text-[var(--accent)]">✓</span>}
                  </h3>
                  <span className="text-xs text-[var(--muted)] tnum">{list.length}</span>
                </div>
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {list.map((p) => (
                      <Link
                        key={p.slug}
                        href={`/player/${p.slug}`}
                        className={`text-sm px-2.5 py-1 rounded-lg transition-colors ${
                          isWinner
                            ? "bg-[var(--accent)]/15 text-white hover:bg-[var(--accent)]/25"
                            : "bg-white/5 text-[var(--muted)] hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {p.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
