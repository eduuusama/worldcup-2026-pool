"use client";

import Link from "next/link";
import { matches, players, results, decidedCount, lastUpdated } from "@/lib/data";
import { leaderboard } from "@/lib/scoring";
import { useLang } from "@/lib/i18n";

const MEDAL = ["🥇", "🥈", "🥉"];

function fmtDate(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  return new Date(iso + "T12:00:00").toLocaleDateString(lang === "es" ? "es-ES" : "en-US", {
    day: "numeric",
    month: "short",
  });
}

export default function LeaderboardPage() {
  const { t, lang } = useLang();
  const board = leaderboard(players, matches, results);
  const decided = decidedCount();
  const total = matches.length;
  const updated = fmtDate(lastUpdated(), lang);
  const pct = total ? Math.round((decided / total) * 100) : 0;

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
      {board.length === 0 ? (
        <div className="card p-8 text-center text-[var(--muted)] text-sm">{t("empty_players")}</div>
      ) : (
        <section className="space-y-2">
          {board.map((p) => {
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
                </div>

                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold tnum leading-none text-[var(--accent)]">{p.points}</div>
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
