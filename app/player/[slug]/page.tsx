"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getPlayer, matches, matchesOf, players, groups, koPicks, teamInfo } from "@/lib/data";
import { groupBreakdown, leaderboard, scorePlayer } from "@/lib/scoring";
import { computeKoScore, pickStatus } from "@/lib/ko-scoring";
import type { KoPickMatch, KoRoundKey, PickStatus, BracketLike } from "@/lib/ko-scoring";
import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";
import { useBracket } from "@/lib/bracket-context";
import { Badge, TeamLabel } from "@/components/TeamLabel";
import type { Match } from "@/lib/types";

// ─── Bracket topology ────────────────────────────────────────────────────────
// Fixed for the FIFA WC 2026 Excel template (match IDs 73-103).
// Each match ID maps to the two previous-round match IDs that feed it.
// R32 matches (73-88) have no feeders — they are leaf nodes.
const FEEDERS: Record<number, [number, number]> = {
  103: [101, 102],
  101: [97,  98 ],
  102: [99,  100],
  97:  [89,  90 ],
  98:  [93,  94 ],
  99:  [91,  92 ],
  100: [95,  96 ],
  89:  [74,  77 ],
  90:  [73,  75 ],
  93:  [83,  84 ],
  94:  [81,  82 ],
  91:  [76,  78 ],
  92:  [79,  80 ],
  95:  [86,  88 ],
  96:  [85,  87 ],
};

const LINE = "var(--line)";

// ─── Bracket card ─────────────────────────────────────────────────────────────

function KoCard({
  match,
  status,
  lang,
  highlight = false,
}: {
  match: KoPickMatch;
  status: PickStatus;
  lang: "es" | "en";
  highlight?: boolean;
}) {
  function Slot({ teamKey }: { teamKey: string }) {
    const info = teamInfo(teamKey, lang);
    const isPick = teamKey === match.pick;
    return (
      <div className="flex flex-col items-center gap-[3px] w-9">
        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs leading-none shrink-0">
          {info.flag}
        </div>
        <span
          className={`text-[8px] font-bold leading-none tracking-wide ${
            isPick
              ? status === "correct"
                ? "text-emerald-400"
                : status === "wrong"
                ? "text-rose-400 line-through"
                : "text-[var(--accent)]"
              : "text-white/30"
          }`}
        >
          {info.name.slice(0, 3).toUpperCase()}
        </span>
      </div>
    );
  }

  const borderClass =
    status === "correct"
      ? "border-emerald-500/50"
      : status === "wrong"
      ? "border-rose-500/25 opacity-55"
      : highlight
      ? "border-[var(--accent)]/50"
      : "border-[var(--line)]";

  const badge =
    status === "correct" ? (
      <span className="text-[6.5px] font-bold text-emerald-400">✓ +{match.pts}</span>
    ) : status === "wrong" ? (
      <span className="text-[6.5px] text-rose-400/70">✗</span>
    ) : (
      <span className="text-[6.5px] text-[var(--accent)]/50">+{match.pts}</span>
    );

  return (
    <div
      className={`w-20 shrink-0 rounded-lg border bg-[var(--card)] px-2 pt-2 pb-1.5 flex flex-col items-center gap-1 ${borderClass}`}
    >
      <div className="flex items-start justify-center gap-3">
        <Slot teamKey={match.teamA} />
        <Slot teamKey={match.teamB} />
      </div>
      <div className="text-center leading-none">{badge}</div>
    </div>
  );
}

// ─── Connector (same as bracket page) ────────────────────────────────────────

function KoConnector({ dir }: { dir: "left" | "right" }) {
  const side = dir === "left" ? "border-r" : "border-l";
  return (
    <div className="w-1.5 sm:w-2 self-stretch flex flex-col shrink-0" aria-hidden>
      <div className={`flex-1 ${side} border-b`} style={{ borderColor: LINE }} />
      <div className={`flex-1 ${side} border-t`} style={{ borderColor: LINE }} />
    </div>
  );
}

// ─── Recursive tree ───────────────────────────────────────────────────────────

function KoTree({
  matchId,
  picks,
  bracket,
  dir,
  lang,
  highlight,
}: {
  matchId: number;
  picks: Record<string, KoPickMatch>;
  bracket: BracketLike | null;
  dir: "left" | "right";
  lang: "es" | "en";
  highlight?: boolean;
}): React.ReactElement {
  const match = picks[String(matchId)];
  if (!match) return <span />;

  const status = pickStatus(match.pick, match.round, bracket);
  const card = (
    <div className="flex items-center">
      <KoCard match={match} status={status} lang={lang} highlight={highlight} />
    </div>
  );

  const feeders = FEEDERS[matchId];
  if (!feeders) return card; // R32 leaf

  const [f1, f2] = feeders;
  const feedersEl = (
    <div className="flex flex-col justify-around gap-2">
      <KoTree matchId={f1} picks={picks} bracket={bracket} dir={dir} lang={lang} />
      <KoTree matchId={f2} picks={picks} bracket={bracket} dir={dir} lang={lang} />
    </div>
  );

  return dir === "left" ? (
    <div className="flex items-stretch">
      {feedersEl}
      <KoConnector dir="left" />
      {card}
    </div>
  ) : (
    <div className="flex items-stretch">
      {card}
      <KoConnector dir="right" />
      {feedersEl}
    </div>
  );
}

// ─── Full bracket layout ──────────────────────────────────────────────────────

function KoBracket({
  picks,
  bracket,
  lang,
  totalKoPts,
}: {
  picks: Record<string, KoPickMatch>;
  bracket: BracketLike | null;
  lang: "es" | "en";
  totalKoPts: number;
}) {
  const finalMatch = picks["103"];
  const { t } = useLang();

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--line)] bg-white/[0.02]">
        <h2 className="font-semibold text-sm">{t("ko_section")}</h2>
        {totalKoPts > 0 && (
          <span className="text-xs text-emerald-400 font-bold tnum">+{totalKoPts} pts</span>
        )}
      </div>

      {/* Break out of max-w-4xl so the full bracket has room */}
      <div
        className="overflow-x-auto pb-4 pt-3 px-4"
        style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}
      >
        <div className="flex items-center justify-center gap-1 min-w-max mx-auto">
          {/* Left half — SF 101 and all its feeders */}
          <KoTree matchId={101} picks={picks} bracket={bracket} dir="left" lang={lang} />

          {/* Connector into FINAL */}
          <KoConnector dir="left" />

          {/* Center: trophy + FINAL card */}
          <div className="flex flex-col items-center gap-1.5 px-1">
            <div className="text-2xl leading-none" aria-hidden>🏆</div>
            <div className="text-[7px] uppercase tracking-widest text-[var(--muted)] font-semibold">
              {t("ko_champion_pick")}
            </div>
            {finalMatch && (
              <div className="flex flex-col items-center gap-0.5">
                <KoCard
                  match={finalMatch}
                  status={pickStatus(finalMatch.pick, "FINAL", bracket)}
                  lang={lang}
                  highlight
                />
                <span className="text-[6.5px] font-bold uppercase tracking-wider text-[var(--accent)] bg-[var(--accent)]/15 px-2 py-px rounded-full">
                  {t("round_final")}
                </span>
              </div>
            )}
          </div>

          {/* Connector from FINAL */}
          <KoConnector dir="right" />

          {/* Right half — SF 102 and all its feeders */}
          <KoTree matchId={102} picks={picks} bracket={bracket} dir="right" lang={lang} />
        </div>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlayerPage() {
  const { t, lang } = useLang();
  const { results } = useResults();
  const { bracket } = useBracket();
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

  const playerKoPicks = koPicks[slug] ?? {};
  const hasKoPicks = Object.keys(playerKoPicks).length > 0;
  const koScore = computeKoScore(playerKoPicks, bracket);
  const totalPts = score.points + koScore.total;

  const sideStats = [
    { label: t("stat_correct"),    value: `${score.correct}/${score.played}` },
    { label: t("stat_accuracy"),   value: score.played ? `${Math.round(score.accuracy * 100)}%` : "—" },
    { label: t("stat_pending"),    value: score.pending },
    { label: t("stat_best_group"), value: best ? t("group_label", { g: best.group }) : "—" },
  ];

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-[var(--muted)] hover:text-white transition-colors inline-block">
        ← {t("profile_back")}
      </Link>

      {/* Hero */}
      <section className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          {/* Left: name + rank */}
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{player.name}</h1>
            <p className="text-sm text-[var(--muted)] mt-0.5">{rank ? `#${rank}` : "—"} · {t("stat_rank")}</p>
          </div>

          {/* Right: points breakdown */}
          <div className="flex flex-col items-end gap-0.5 min-w-[140px]">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] text-[var(--muted)] uppercase tracking-wide">{t("pts_accumulated")}</span>
              <span className="text-2xl font-bold tnum text-[var(--accent)]">{totalPts}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-[var(--muted)]">{t("pts_knockout")}</span>
              <span className="text-sm font-semibold tnum text-emerald-400">{koScore.total}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] text-[var(--muted)]">{t("pts_groups")}</span>
              <span className="text-sm font-semibold tnum">{score.points}</span>
            </div>
          </div>
        </div>

        {/* Secondary stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[var(--line)]">
          {sideStats.map((s) => (
            <div key={s.label}>
              <div className="text-lg font-bold tnum leading-none">{s.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Knockout bracket tree */}
      {hasKoPicks ? (
        <KoBracket
          picks={playerKoPicks}
          bracket={bracket}
          lang={lang as "es" | "en"}
          totalKoPts={koScore.total}
        />
      ) : (
        <section className="card p-5 text-center text-sm text-[var(--muted)]">
          {t("ko_no_picks")}
        </section>
      )}

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

// ─── Group stage match row ────────────────────────────────────────────────────

function MatchRow({ match, pick }: { match: Match; pick: "1" | "X" | "2" | null }) {
  const { t } = useLang();
  const { results } = useResults();
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
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0 text-sm">
        <TeamLabel team={match.teamA} align="right" className="min-w-0 justify-end" />
        <span className="text-xs text-[var(--muted)] tnum px-1 shrink-0">
          {decided ? `${res.scoreA ?? ""}–${res.scoreB ?? ""}` : "vs"}
        </span>
        <TeamLabel team={match.teamB} align="left" className="min-w-0" />
      </div>
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
