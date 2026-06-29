"use client";

import { useState, useMemo } from "react";
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

type Tab = "total" | "groups" | "ko";

export default function LeaderboardPage() {
  const { t, lang } = useLang();
  const { results } = useResults();
  const { bracket } = useBracket();
  const [tab, setTab] = useState<Tab>("total");

  const board = leaderboard(players, matches, results);
  const decided = decidedCount(results);
  const total = matches.length;
  const updated = fmtDate(lastUpdated(results), lang);
  const pct = total ? Math.round((decided / total) * 100) : 0;

  // Augment every entry with KO score
  const augmented = useMemo(() => board.map((p) => {
    const picks = koPicks[p.slug];
    const ko = picks ? computeKoScore(picks, bracket) : null;
    return { ...p, koPts: ko?.total ?? 0, totalPts: p.points + (ko?.total ?? 0) };
  }), [board, bracket]);

  // Produce a ranked list for the active tab
  const ranked = useMemo(() => {
    const sorter =
      tab === "total"  ? (a: typeof augmented[0], b: typeof augmented[0]) => b.totalPts - a.totalPts || a.name.localeCompare(b.name) :
      tab === "groups" ? (a: typeof augmented[0], b: typeof augmented[0]) => b.points   - a.points   || a.name.localeCompare(b.name) :
                         (a: typeof augmented[0], b: typeof augmented[0]) => b.koPts     - a.koPts    || a.name.localeCompare(b.name);

    const sorted = [...augmented].sort(sorter);

    const getScore = (p: typeof augmented[0]) =>
      tab === "total" ? p.totalPts : tab === "groups" ? p.points : p.koPts;

    let rank = 0;
    let prevScore = Number.NaN;
    return sorted.map((p, i) => {
      const score = getScore(p);
      if (score !== prevScore) { rank = i + 1; prevScore = score; }
      return { ...p, rank, displayPts: score };
    });
  }, [augmented, tab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "total",  label: t("pts_accumulated") },
    { id: "groups", label: t("pts_groups") },
    { id: "ko",     label: t("pts_knockout") },
  ];

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <section className="card px-5 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--muted)]">{t("decided", { n: decided, total })}</span>
          <span className="text-[var(--muted)]">
            {updated ? t("updated", { date: updated }) : t("never_updated")}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--card)] border border-[var(--line)]">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-colors ${
              tab === id
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

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
                {/* Rank / medal */}
                <div className="w-8 text-center shrink-0">
                  {medal ? (
                    <span className="text-xl">{medal}</span>
                  ) : (
                    <span className="text-[var(--muted)] font-semibold tnum">{p.rank}</span>
                  )}
                </div>

                {/* Name + breakdown */}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-[var(--muted)] tnum">
                    {p.correct}/{p.played} {t("col_correct").toLowerCase()}
                    {p.played > 0 && <> · {Math.round(p.accuracy * 100)}%</>}
                  </div>
                  {/* Secondary line — show the other two scores as context */}
                  <div className="text-[10px] text-[var(--muted)] tnum mt-0.5 flex gap-2">
                    {tab !== "groups" && (
                      <span>{t("pts_groups")}: {p.points}</span>
                    )}
                    {tab !== "ko" && (
                      <span className={p.koPts > 0 ? "text-emerald-400/70" : ""}>
                        {t("pts_knockout")}: {p.koPts}
                      </span>
                    )}
                    {tab !== "total" && (
                      <span>{t("pts_accumulated")}: {p.totalPts}</span>
                    )}
                  </div>
                </div>

                {/* Score for active tab */}
                <div className="text-right shrink-0">
                  <div className={`text-2xl font-bold tnum leading-none ${
                    tab === "ko" ? "text-emerald-400" : "text-[var(--accent)]"
                  }`}>
                    {p.displayPts}
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
