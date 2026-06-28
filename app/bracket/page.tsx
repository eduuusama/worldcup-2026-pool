"use client";

import { useEffect, useRef, useState } from "react";
import { teamInfo } from "@/lib/data";
import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";

type RoundKey = "R32" | "R16" | "QF" | "SF" | "BRONZE" | "FINAL";
interface Ref {
  round: RoundKey;
  num: number;
  kind: "W" | "L";
}
interface Side {
  teamKey: string | null;
  abbr: string | null;
  score: number | null;
  winner: boolean;
  ref: Ref | null;
}
interface Match {
  id: string;
  round: RoundKey;
  num: number;
  date: string;
  venue: string | null;
  state: "pre" | "in" | "post";
  home: Side;
  away: Side;
}
interface Bracket {
  rounds: Record<RoundKey, Match[]>;
  updatedAt: string;
}

const LINE = "var(--line)";

export default function BracketPage() {
  const { t, lang } = useLang();
  const { lastUpdate } = useResults();
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [error, setError] = useState(false);
  const fetchKeyRef = useRef(0);

  const fetchBracket = (bust = false) => {
    setError(false);
    const url = bust ? `/api/bracket?v=${Date.now()}` : "/api/bracket";
    fetch(url)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(true) : setBracket(d)))
      .catch(() => setError(true));
  };

  // Initial load
  useEffect(() => { fetchBracket(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when the user clicks "Actualizar"
  useEffect(() => {
    if (!lastUpdate?.ts) return;
    const key = lastUpdate.ts;
    if (key === fetchKeyRef.current) return;
    fetchKeyRef.current = key;
    fetchBracket(true);
  }, [lastUpdate?.ts]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="card p-8 text-center text-[var(--muted)] text-sm">⚠️</div>;
  if (!bracket) {
    return (
      <div className="card p-10 text-center text-[var(--muted)] text-sm">
        <div className="inline-block w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mr-2 align-[-3px]" />
        {t("bracket_loading")}
      </div>
    );
  }

  const lookup = (r: Ref): Match | null =>
    bracket.rounds[r.round]?.find((m) => m.num === r.num) ?? null;

  const dateLabel = (iso: string) => {
    if (!iso) return "";
    return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
      day: "numeric",
      month: "short",
      timeZone: "America/El_Salvador",
    }).format(new Date(iso));
  };

  // Kickoff time in El Salvador (24h in ES, 12h in EN).
  const timeLabel = (iso: string) => {
    if (!iso) return "";
    return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/El_Salvador",
    }).format(new Date(iso));
  };

  function SideRow({ side, played }: { side: Side; played: boolean }) {
    const info = side.teamKey ? teamInfo(side.teamKey, lang) : null;
    const resolved = !!info;
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 ${
          side.winner ? "bg-[var(--accent)]/12" : ""
        }`}
      >
        <span className="text-sm leading-none w-4 text-center shrink-0">{resolved ? info!.flag : "·"}</span>
        <span
          className={`text-[11px] font-semibold truncate flex-1 ${
            resolved ? (side.winner ? "text-white" : "text-[var(--fg)]") : "text-[var(--muted)]"
          }`}
        >
          {resolved ? side.abbr ?? info!.name : t("tbd")}
        </span>
        {played && side.score != null && (
          <span className={`text-[11px] tnum shrink-0 ${side.winner ? "text-[var(--accent)] font-bold" : "text-[var(--muted)]"}`}>
            {side.score}
          </span>
        )}
      </div>
    );
  }

  function Card({ match }: { match: Match }) {
    return (
      <div className="w-[108px] sm:w-[120px] shrink-0 rounded-lg border border-[var(--line)] bg-[var(--card)] overflow-hidden">
        <SideRow side={match.home} played={match.state !== "pre"} />
        <div className="border-t border-[var(--line)]" />
        <SideRow side={match.away} played={match.state !== "pre"} />
        <div className="text-[8.5px] uppercase tracking-wide text-[var(--muted)] text-center py-0.5 border-t border-[var(--line)] bg-white/[0.015]">
          {dateLabel(match.date)} · {timeLabel(match.date)}
        </div>
      </div>
    );
  }

  function Connector({ dir }: { dir: "left" | "right" }) {
    const side = dir === "left" ? "border-r" : "border-l";
    return (
      <div className="w-2 sm:w-3 self-stretch flex flex-col shrink-0" aria-hidden>
        <div className={`flex-1 ${side} border-b`} style={{ borderColor: LINE }} />
        <div className={`flex-1 ${side} border-t`} style={{ borderColor: LINE }} />
      </div>
    );
  }

  // Recursive: render a match and everything that feeds it, fanning toward `dir`.
  function Tree({ match, dir }: { match: Match; dir: "left" | "right" }): React.ReactElement {
    const f1 = match.home.ref ? lookup(match.home.ref) : null;
    const f2 = match.away.ref ? lookup(match.away.ref) : null;
    if (!f1 && !f2) return <Card match={match} />;
    const feeders = (
      <div className="flex flex-col justify-around gap-2">
        {f1 ? <Tree match={f1} dir={dir} /> : <span />}
        {f2 ? <Tree match={f2} dir={dir} /> : <span />}
      </div>
    );
    const card = <div className="flex items-center">{<Card match={match} />}</div>;
    return dir === "left" ? (
      <div className="flex items-stretch">
        {feeders}
        <Connector dir="left" />
        {card}
      </div>
    ) : (
      <div className="flex items-stretch">
        {card}
        <Connector dir="right" />
        {feeders}
      </div>
    );
  }

  const sf1 = bracket.rounds.SF?.find((m) => m.num === 1);
  const sf2 = bracket.rounds.SF?.find((m) => m.num === 2);
  const final = bracket.rounds.FINAL?.[0];
  const bronze = bracket.rounds.BRONZE?.[0];

  const PHASES: { key: "round_r32" | "round_r16" | "round_qf" | "round_sf" | "round_final"; pts: number }[] = [
    { key: "round_r32", pts: 10 },
    { key: "round_r16", pts: 20 },
    { key: "round_qf", pts: 40 },
    { key: "round_sf", pts: 80 },
    { key: "round_final", pts: 160 },
  ];

  return (
    <div>
      {/* Points-per-phase legend */}
      <section className="card p-3 mb-2">
        <h2 className="text-sm font-bold tracking-tight mb-2">{t("bracket_points_title")}</h2>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p) => (
            <div
              key={p.key}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white/[0.03] px-2.5 py-1.5"
            >
              <span className="text-xs text-[var(--muted)]">{t(p.key)}</span>
              <span className="text-xs font-bold text-[var(--accent)] tnum">{p.pts} pts</span>
            </div>
          ))}
        </div>
      </section>

      {/* Break out of the layout's max-w-4xl so the full bracket can breathe. */}
      <div className="overflow-x-auto pb-3 px-4" style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}>
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 min-w-max mx-auto">
          {/* Left half */}
          {sf1 && <Tree match={sf1} dir="left" />}

          {/* Center: connector to final, champion, final, bronze */}
          <Connector dir="left" />
          <div className="flex flex-col items-center gap-2 px-1">
            <div className="text-2xl" aria-hidden>🏆</div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{t("bracket_champion")}</div>
            {final && (
              <div className="ring-1 ring-[var(--accent)]/40 rounded-lg">
                <Card match={final} />
              </div>
            )}
            {bronze && (
              <div className="mt-1 opacity-90">
                <div className="text-[8.5px] uppercase tracking-wider text-[var(--muted)] text-center mb-0.5">
                  🥉 {t("round_bronze")}
                </div>
                <Card match={bronze} />
              </div>
            )}
          </div>
          <Connector dir="right" />

          {/* Right half */}
          {sf2 && <Tree match={sf2} dir="right" />}
        </div>
      </div>
    </div>
  );
}
