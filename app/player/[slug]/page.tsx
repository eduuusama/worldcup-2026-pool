"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getPlayer, matches, matchesOf, players, results, groups } from "@/lib/data";
import { groupBreakdown, leaderboard, scorePlayer } from "@/lib/scoring";
import { useLang } from "@/lib/i18n";
import { Badge, TeamLabel } from "@/components/TeamLabel";
import type { Match } from "@/lib/types";

export default function PlayerPage() {
  const { t } = useLang();
  const params = useParams();
  const slug = String(params.slug);
  const player = getPlayer(slug);

  if (!player) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-[var(--muted)]">404</p>
        <Link href="/" className="text-[var(--accent)] text-sm">
          ← {t("profile_back")}
        </Link>
      </div>
    );
  }

  const score = scorePlayer(player, matches, results);
  const rank = leaderboard(players, matches, results).find((p) => p.slug === slug)?.rank ?? 0;
  const breakdown = groupBreakdown(player, matches, results);
  const best = [...breakdown]
    .filter((g) => g.played > 0)
    .sort((a, b) => b.correct - a.correct || b.correct / b.played - a.correct / a.played)[0];

  const stats = [
    { label: t("stat_rank"), value: rank ? `#${rank}` : "—" },
    { label: t("stat_points"), value: score.points, accent: true },
    { label: t("stat_correct"), value: `${score.correct}/${score.played}` },
    { label: t("stat_accuracy"), value: score.played ? `${Math.round(score.accuracy * 100)}%` : "—" },
    { label: t("stat_pending"), value: score.pending },
    { label: t("stat_best_group"), value: best ? `${t("group_label", { g: best.group })}` : "—" },
  ];

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-white transition-colors inline-block">
        ← {t("profile_back")}
      </Link>

      {/* Hero */}
      <section className="card p-5">
        <h1 className="text-2xl font-bold tracking-tight">{player.name}</h1>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
          {stats.map((s) => (
            <div key={s.label}>
              <div
                className={`text-xl font-bold tnum leading-none ${s.accent ? "text-[var(--accent)]" : ""}`}
              >
                {s.value}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Picks by group */}
      {groups.map((g) => {
        const gm = matchesOf(g);
        const bd = breakdown.find((b) => b.group === g);
        return (
          <section key={g} className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--line)] bg-white/[0.02]">
              <h2 className="font-semibold text-sm">{t("group_label", { g })}</h2>
              <span className="text-xs text-[var(--muted)] tnum">
                {bd?.correct ?? 0}/{bd?.played ?? 0}
              </span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {gm.map((m) => (
                <MatchRow key={m.id} match={m} pick={player.picks[String(m.id)] ?? null} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MatchRow({ match, pick }: { match: Match; pick: "1" | "X" | "2" | null }) {
  const { t } = useLang();
  const res = results[String(match.id)];
  const outcome = res?.outcome ?? null;
  const decided = outcome !== null;
  const correct = decided && pick === outcome;
  const wrong = decided && pick !== outcome;

  return (
    <div
      className={`grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 ${
        correct ? "row-correct" : wrong ? "row-wrong" : ""
      }`}
    >
      {/* Match */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0 text-sm">
        <TeamLabel team={match.teamA} align="right" className="min-w-0 justify-end" />
        <span className="text-xs text-[var(--muted)] tnum px-1 shrink-0">
          {decided ? `${res.scoreA ?? ""}–${res.scoreB ?? ""}` : "vs"}
        </span>
        <TeamLabel team={match.teamB} align="left" className="min-w-0" />
      </div>

      {/* Pick + status */}
      <div className="flex items-center gap-2 shrink-0">
        <Badge value={pick} />
        {decided ? (
          correct ? (
            <span className="text-[var(--accent)] text-sm w-5 text-center">✓</span>
          ) : (
            <span className="flex items-center gap-1">
              <span className="text-rose-400 text-sm">✗</span>
              <Badge value={outcome} />
            </span>
          )
        ) : (
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide w-12 text-right">
            {t("result_pending")}
          </span>
        )}
      </div>
    </div>
  );
}
