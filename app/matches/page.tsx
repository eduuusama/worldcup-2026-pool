"use client";

import { groups, matchesOf, players } from "@/lib/data";
import { matchPickStats } from "@/lib/scoring";
import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";
import { Badge, TeamLabel } from "@/components/TeamLabel";
import type { Match } from "@/lib/types";

export default function MatchesPage() {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <section className="card p-5">
        <h1 className="text-xl font-bold tracking-tight">{t("matches_title")}</h1>
        <p className="text-xs text-[var(--muted)] mt-1">{t("legend")}</p>
      </section>

      {groups.map((g) => (
        <section key={g} className="card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--line)] bg-white/[0.02]">
            <h2 className="font-semibold text-sm">{t("group_label", { g })}</h2>
          </div>
          <div className="divide-y divide-[var(--line)]">
            {matchesOf(g).map((m) => (
              <FixtureRow key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FixtureRow({ match }: { match: Match }) {
  const { t } = useLang();
  const { results } = useResults();
  const res = results[String(match.id)];
  const outcome = res?.outcome ?? null;
  const decided = outcome !== null;
  const stats = matchPickStats(match.id, players, outcome);

  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0 text-sm">
        <TeamLabel team={match.teamA} align="right" className="min-w-0 justify-end" />
        <span className="text-xs text-[var(--muted)] tnum px-1 shrink-0">
          {decided ? `${res.scoreA ?? ""}–${res.scoreB ?? ""}` : "vs"}
        </span>
        <TeamLabel team={match.teamB} align="left" className="min-w-0" />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {decided ? (
          <>
            <Badge value={outcome} />
            {players.length > 0 && (
              <span className="text-[11px] text-[var(--muted)] tnum w-14 text-right">
                {t("got_it_right", { n: stats.correctCount, total: stats.totalPlayers })}
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] text-[var(--muted)] uppercase tracking-wide w-14 text-right">
            {t("result_pending")}
          </span>
        )}
      </div>
    </div>
  );
}
