"use client";

import { useEffect, useRef, useState } from "react";
import { teamInfo } from "@/lib/data";
import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";

type RoundKey = "R32" | "R16" | "QF" | "SF" | "BRONZE" | "FINAL";
interface Side {
  teamKey: string | null;
  score: number | null;
  winner: boolean;
}
interface Match {
  id: number;
  round: RoundKey;
  date: string;
  state: "pre" | "in" | "post";
  home: Side;
  away: Side;
}
interface Bracket {
  matches: Record<string, Match>;
  updatedAt: string;
}

// Fixed FIFA topology — winners propagate up. Must mirror lib/bracket.ts.
const FEEDERS: Record<number, [number, number]> = {
  89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
  93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
  97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
  101: [97, 98], 102: [99, 100], 103: [101, 102],
};

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
      .then((d) => (d.error || !d.matches ? setError(true) : setBracket(d)))
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

  const get = (id: number): Match | undefined => bracket.matches[String(id)];

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

  function Card({ match, highlight = false }: { match: Match; highlight?: boolean }) {
    const played = match.state !== "pre";

    function Slot({ side }: { side: Side }) {
      const info = side.teamKey ? teamInfo(side.teamKey, lang) : null;
      return (
        <div className="flex flex-col items-center gap-[3px] w-9">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs leading-none shrink-0 ${
            !info ? "border border-white/15 bg-white/5" : ""
          }`}>
            {info?.flag ?? <span className="text-white/20 text-[8px]">?</span>}
          </div>
          <span className={`text-[8px] font-bold leading-none tracking-wide ${
            side.winner ? "text-[var(--accent)]" : info ? "text-white/80" : "text-white/25"
          }`}>
            {info ? info.name.slice(0, 3).toUpperCase() : "TBD"}
          </span>
          {played && side.score != null && (
            <span className={`text-[11px] font-bold tnum leading-none ${
              side.winner ? "text-[var(--accent)]" : "text-white/50"
            }`}>{side.score}</span>
          )}
        </div>
      );
    }

    return (
      <div className={`w-20 shrink-0 rounded-lg border bg-[var(--card)] px-2 pt-2 pb-1.5 flex flex-col items-center gap-1 ${
        highlight ? "border-[var(--accent)]/50" : "border-[var(--line)]"
      }`}>
        <div className="flex items-start justify-center gap-3">
          <Slot side={match.home} />
          <Slot side={match.away} />
        </div>
        <div className="text-[6.5px] text-[var(--muted)] text-center tracking-wide leading-tight">
          {dateLabel(match.date)} · {timeLabel(match.date)}
        </div>
      </div>
    );
  }

  function Connector({ dir }: { dir: "left" | "right" }) {
    const side = dir === "left" ? "border-r" : "border-l";
    return (
      <div className="w-1.5 sm:w-2 self-stretch flex flex-col shrink-0" aria-hidden>
        <div className={`flex-1 ${side} border-b`} style={{ borderColor: LINE }} />
        <div className={`flex-1 ${side} border-t`} style={{ borderColor: LINE }} />
      </div>
    );
  }

  // Recursive: render a match and everything that feeds it, fanning toward `dir`.
  function Tree({ id, dir }: { id: number; dir: "left" | "right" }): React.ReactElement {
    const match = get(id);
    if (!match) return <span />;
    const feeders = FEEDERS[id];
    if (!feeders) return <Card match={match} />; // R32 leaf

    const [f1, f2] = feeders;
    const feedersEl = (
      <div className="flex flex-col justify-around gap-2">
        <Tree id={f1} dir={dir} />
        <Tree id={f2} dir={dir} />
      </div>
    );
    const card = <div className="flex items-center"><Card match={match} /></div>;
    return dir === "left" ? (
      <div className="flex items-stretch">
        {feedersEl}
        <Connector dir="left" />
        {card}
      </div>
    ) : (
      <div className="flex items-stretch">
        {card}
        <Connector dir="right" />
        {feedersEl}
      </div>
    );
  }

  const final = get(103);
  const bronze = get(104);

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
      <section className="card p-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-[var(--fg)] mr-1">{t("bracket_points_title")}:</span>
          {PHASES.map((p) => (
            <div
              key={p.key}
              className="flex items-center gap-1 rounded border border-[var(--line)] bg-white/[0.03] px-1.5 py-0.5"
            >
              <span className="text-[9px] text-[var(--muted)]">{t(p.key)}</span>
              <span className="text-[9px] font-bold text-[var(--accent)] tnum">{p.pts}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Break out of the layout's max-w-4xl so the full bracket can breathe. */}
      <div className="overflow-x-auto pb-3 px-4" style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}>
        <div className="flex items-center justify-center gap-1 min-w-max mx-auto">
          {/* Left half — SF 101 and everything feeding it */}
          <Tree id={101} dir="left" />

          {/* Center: trophy + final + bronze */}
          <Connector dir="left" />
          <div className="flex flex-col items-center gap-1.5 px-1">
            <div className="text-2xl leading-none" aria-hidden>🏆</div>
            <div className="text-[7px] uppercase tracking-widest text-[var(--muted)] font-semibold">
              {t("bracket_champion")}
            </div>
            {final && (
              <div className="flex flex-col items-center gap-0.5">
                <Card match={final} highlight />
                <span className="text-[6.5px] font-bold uppercase tracking-wider text-[var(--accent)] bg-[var(--accent)]/15 px-2 py-px rounded-full">
                  {t("round_final")}
                </span>
              </div>
            )}
            {bronze && (
              <div className="flex flex-col items-center gap-0.5 mt-0.5">
                <Card match={bronze} />
                <span className="text-[6.5px] font-bold uppercase tracking-wider text-sky-400 bg-sky-400/15 px-2 py-px rounded-full">
                  {t("round_bronze")}
                </span>
              </div>
            )}
          </div>
          <Connector dir="right" />

          {/* Right half — SF 102 and everything feeding it */}
          <Tree id={102} dir="right" />
        </div>
      </div>
    </div>
  );
}
