"use client";

import Link from "next/link";
import { matches, players, decidedCount, lastUpdated, koPicks } from "@/lib/data";
import { leaderboard } from "@/lib/scoring";
import { computeKoScore } from "@/lib/ko-scoring";
import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";
import { useBracket } from "@/lib/bracket-context";

const MEDAL = ["🥇", "🥈", "🥉"];

function fmtDate(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso + "T12:00:00").toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

const hasAnyKoPicks = Object.keys(koPicks).length > 0;

export default function LeaderboardPage() {
  const { t, lang } = useLang();
  const { results } = useResults();
  const { bracket } = useBracket();

  const board = leaderboard(players, matches, results);
  const decided = decidedCount(results);
  const total = matches.length;
  const updated = fmtDate(lastUpdated(results), lang);
  const pct = total ? Math.round((decided / total) * 100) : 0;

  // Augment each board entry with KO points
  const augmented = board.map((p) => {
    const picks = koPicks[p.slug];
    const ko = picks ? computeKoScore(picks, bracket) : null;
    return { ...p, koPts: ko?.total ?? 0, totalPts: p.points + (ko?.total ?? 0) };
  });

  // Re-sort by total (group + KO) desc, then name
  augmented.sort((a, b) => b.totalPts - a.totalPts || a.name.localeCompare(b.name));

  // Assign competition ranks on totalPts
  let rank = 0;
  let prevTotal = Number.NaN;
  const ranked = augmented.map((p, i) => {
    if (p.totalPts !== prevTotal) { rank = i + 1; prevTotal = p.totalPts; }
    return { ...p, rank };
  });

  return (
    <div className="space-y-5">
      {/* Header / status */}
      <section className="card p-5">
        <h1 className="text-xl font-bold tracking-tight">{t("leaderboard_title")}</h1>
        <p className="text-xs text-[var(--muted)] mt-1">{t("legend")}</p>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">{t("decided", { n: decided, total })}</span>
          <span className="text-[var(--muted)]">
            {updated ? t("updated", { date: updated }) : t("never_updated")}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {/* Ranking */}
      {ranked.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)] text-sm">{t("empty_players")}</div>
      ) : (
        <section className="space-y-2">
          {ranked.map((p) => {
            const medal = p.rank <= 3 ? MEDAL[p.rank - 1] : null;
            return (
              <Link
                key={p.slug}
                href={`/player/${p.slug}`}
                className="card px-4 py-3 flex items-center gap-3 hover:bg-[var(--card-hover)] transition-colors"
              >
                <div className="w-8 text-center shrink-0">
                  {medal ? (
                    <span className="text-xl">{medal}</span>
                  ) : (
                    <span className="text-[var(--muted)] font-semibold tnum">{p.rank}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-[var(--muted)] tnum">
                    {p.correct}/{p.played} {t("col_correct").toLowerCase()}
                    {p.played > 0 && <> · {Math.round(p.accuracy * 100)}%</>}
                  </div>
                  {/* KO breakdown row */}
                  {hasAnyKoPicks && (
                    <div className="text-[10px] text-[var(--muted)] tnum mt-0.5">
                      <span>{t("ko_group_label")}: {p.points}</span>
                      {p.koPts > 0 && (
                        <span className="ml-2 text-[var(--accent)]">+{p.koPts} {t("ko_pts_label")}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold tnum leading-none text-[var(--accent)]">
                    {p.totalPts}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-0.5">
                    {t("col_points")}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
