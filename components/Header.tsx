"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/i18n";
import { UpdateScoresButton } from "@/components/UpdateScoresButton";

export function Header() {
  const { t, lang, setLang, toggle } = useLang();
  const pathname = usePathname();
  const isMatches = pathname?.startsWith("/matches");
  const isBracket = pathname?.startsWith("/bracket");
  const onLeaderboard = pathname === "/" || pathname?.startsWith("/player");

  return (
    <header className="border-b border-[var(--line)] sticky top-0 z-20 backdrop-blur-md bg-[rgba(7,18,13,0.72)]">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl leading-none">🏆</span>
          <span className="min-w-0">
            <span className="block font-bold tracking-tight leading-tight truncate">
              Gran Quinela Mundialista
            </span>
            <span className="block text-[11px] text-[var(--muted)] leading-tight whitespace-nowrap truncate">
              {t("subtitle")} · 2026
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-0.5 sm:gap-1 text-sm shrink-0">
          <Link
            href="/"
            className={`px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
              onLeaderboard ? "text-white bg-white/5" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {t("nav_leaderboard")}
          </Link>
          <Link
            href="/matches"
            className={`px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
              isMatches ? "text-white bg-white/5" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {t("nav_matches")}
          </Link>
          <Link
            href="/bracket"
            className={`px-2 sm:px-3 py-1.5 rounded-lg transition-colors ${
              isBracket ? "text-white bg-white/5" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {t("nav_bracket")}
          </Link>
        </nav>

        <UpdateScoresButton />

        {/* Mobile: single sliding toggle switch (ES <-> EN) */}
        <button
          onClick={toggle}
          role="switch"
          aria-checked={lang === "en"}
          aria-label="ES / EN"
          className="pill sm:hidden relative flex h-8 w-[72px] items-center text-[11px] font-bold overflow-hidden shrink-0"
        >
          <span
            aria-hidden
            className={`absolute top-0.5 left-0.5 h-[calc(100%-4px)] w-[34px] rounded-full bg-[var(--accent)] transition-transform duration-200 ${
              lang === "en" ? "translate-x-[34px]" : ""
            }`}
          />
          <span className={`relative z-10 flex-1 text-center ${lang === "es" ? "text-[#06150e]" : "text-[var(--muted)]"}`}>
            ES
          </span>
          <span className={`relative z-10 flex-1 text-center ${lang === "en" ? "text-[#06150e]" : "text-[var(--muted)]"}`}>
            EN
          </span>
        </button>

        {/* Desktop: two-button pill */}
        <div className="pill hidden sm:flex text-xs font-semibold overflow-hidden shrink-0">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`px-2.5 py-1.5 transition-colors ${
                lang === l ? "bg-[var(--accent)] text-[#06150e]" : "text-[var(--muted)] hover:text-white"
              }`}
              aria-pressed={lang === l}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
