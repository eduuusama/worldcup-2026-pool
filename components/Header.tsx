"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/i18n";

export function Header() {
  const { t, lang, setLang } = useLang();
  const pathname = usePathname();
  const isMatches = pathname?.startsWith("/matches");
  const onLeaderboard = pathname === "/" || pathname?.startsWith("/player");

  return (
    <header className="border-b border-[var(--line)] sticky top-0 z-20 backdrop-blur-md bg-[rgba(7,18,13,0.72)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl leading-none">🏆</span>
          <span className="min-w-0">
            <span className="block font-bold tracking-tight leading-tight truncate">
              Gran Quinela Mundialista
            </span>
            <span className="block text-[11px] text-[var(--muted)] leading-tight">
              {t("subtitle")} · 2026
            </span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              onLeaderboard ? "text-white bg-white/5" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {t("nav_leaderboard")}
          </Link>
          <Link
            href="/matches"
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              isMatches ? "text-white bg-white/5" : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {t("nav_matches")}
          </Link>
        </nav>

        <div className="pill flex text-xs font-semibold overflow-hidden">
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
