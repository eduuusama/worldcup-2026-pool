"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "@/lib/i18n";

// Mobile-only bottom tab bar (native-app pattern). Hidden on sm+ where the
// header carries the inline nav.

function IconTable({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconMatches({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7l4.5 3.3-1.7 5.3H9.2l-1.7-5.3L12 7z" />
    </svg>
  );
}

function IconBracket({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={active ? 2.4 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 5h4v5h4M5 14h4v5h4" /><path d="M13 12h6" />
      <circle cx="20" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BottomNav() {
  const { t } = useLang();
  const pathname = usePathname();
  const isMatches = pathname?.startsWith("/matches");
  const isBracket = pathname?.startsWith("/bracket");
  const onLeaderboard = pathname === "/" || pathname?.startsWith("/player");

  const tabs = [
    { href: "/", label: t("nav_leaderboard"), active: onLeaderboard, Icon: IconTable },
    { href: "/matches", label: t("nav_matches"), active: isMatches, Icon: IconMatches },
    { href: "/bracket", label: t("nav_bracket"), active: isBracket, Icon: IconBracket },
  ];

  return (
    <nav
      className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[var(--line)] backdrop-blur-md bg-[rgba(7,18,13,0.92)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {tabs.map(({ href, label, active, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              active ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            <Icon active={!!active} />
            <span className={`text-[10px] tracking-wide ${active ? "font-bold" : "font-medium"}`}>
              {label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
