"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { matchById, players, teamInfo } from "@/lib/data";
import fixturesMetaJson from "@/data/fixtures-meta.json";
import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";
import type { Pick, Player } from "@/lib/types";

interface FixtureMeta {
  kickoff: string | null;
  venue: string | null;
  city: string | null;
  country: string | null;
}
const fixturesMeta = fixturesMetaJson as Record<string, FixtureMeta>;

function fmtKickoff(iso: string | null, lang: string): string | null {
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

export default function MatchDetailPage() {
  const { t, lang } = useLang();
  const { results } = useResults();
  const params = useParams();
  const id = String(params.id);
  const match = matchById(id);

  if (!match) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-[var(--muted)]">404</p>
        <Link href="/matches" className="text-[var(--accent)] text-sm">
          ← {t("back_matches")}
        </Link>
      </div>
    );
  }

  const a = teamInfo(match.teamA, lang);
  const b = teamInfo(match.teamB, lang);
  const res = results[id];
  const outcome = res?.outcome ?? null;
  const decided = outcome !== null;
  const meta = fixturesMeta[id] ?? null;
  const kickoff = fmtKickoff(meta?.kickoff ?? null, lang);
  const venue = meta?.venue ? [meta.venue, meta.city, meta.country].filter(Boolean).join(" · ") : null;

  // Group participants by their pick.
  const groups: Record<Pick, Player[]> = { "1": [], X: [], "2": [] };
  for (const p of players) {
    const pk = p.picks[id];
    if (pk) groups[pk].push(p);
  }

  const sections: { key: Pick; label: string }[] = [
    { key: "1", label: `${a.flag} ${a.name} ${t("pick_wins")}` },
    { key: "X", label: `⚖️ ${t("pick_group_draw")}` },
    { key: "2", label: `${b.flag} ${b.name} ${t("pick_wins")}` },
  ];

  return (
    <div className="space-y-5">
      <Link href="/matches" className="text-sm text-[var(--muted)] hover:text-white transition-colors inline-block">
        ← {t("back_matches")}
      </Link>

      {/* Scoreline / header */}
      <section className="card p-5">
        <div className="text-xs text-[var(--muted)] mb-3">{t("group_label", { g: match.group })}</div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="text-right min-w-0">
            <div className="text-2xl leading-none">{a.flag}</div>
            <div className="font-semibold mt-1 truncate">{a.name}</div>
          </div>
          <div className="text-center px-2">
            {decided ? (
              <div className="text-3xl font-bold tnum leading-none">
                {res?.scoreA ?? ""}<span className="text-[var(--muted)] mx-1">–</span>{res?.scoreB ?? ""}
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
            <div className="text-2xl leading-none">{b.flag}</div>
            <div className="font-semibold mt-1 truncate">{b.name}</div>
          </div>
        </div>
      </section>

      {/* Where / when */}
      <section className="card p-5 space-y-3 text-sm">
        <div className="flex items-start gap-3">
          <span className="text-base shrink-0">📍</span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{t("match_where")}</div>
            <div className="mt-0.5">{venue ?? t("match_tbd")}</div>
          </div>
        </div>
        <div className="flex items-start gap-3 border-t border-[var(--line)] pt-3">
          <span className="text-base shrink-0">🕐</span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{t("match_when")}</div>
            <div className="mt-0.5 first-letter:uppercase">{kickoff ?? t("match_tbd")}</div>
          </div>
        </div>
      </section>

      {/* Participants' picks */}
      <section className="space-y-3">
        <h2 className="font-semibold text-sm px-1">{t("match_picks_title")}</h2>
        {sections.map((s) => {
          const list = groups[s.key];
          const isWinner = decided && outcome === s.key;
          return (
            <div
              key={s.key}
              className={`card overflow-hidden ${isWinner ? "ring-1 ring-[var(--accent)]" : decided ? "opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--line)] bg-white/[0.02]">
                <h3 className="font-semibold text-sm">
                  <span className="text-[var(--muted)] mr-1.5">{s.key}</span>
                  {s.label}
                  {isWinner && <span className="text-[var(--accent)] ml-2">✓</span>}
                </h3>
                <span className="text-xs text-[var(--muted)] tnum">{list.length}</span>
              </div>
              <div className="px-4 py-3">
                {list.length === 0 ? (
                  <span className="text-xs text-[var(--muted)]">{t("nobody")}</span>
                ) : (
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
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
