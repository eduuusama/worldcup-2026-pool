"use client";

import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";

/** Header action: pulls the latest finished scores from the web and updates the
 *  leaderboard in place (and commits them so everyone else sees them too). */
export function UpdateScoresButton() {
  const { t } = useLang();
  const { updateScores, updating } = useResults();

  return (
    <button
      onClick={updateScores}
      disabled={updating}
      title={t("update_scores")}
      aria-label={t("update_scores")}
      className="pill flex items-center gap-1.5 px-2.5 sm:px-3 h-8 text-xs font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
    >
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={updating ? "animate-spin" : ""}
        aria-hidden
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </svg>
      <span className="hidden sm:inline">{updating ? t("updating") : t("update_scores")}</span>
    </button>
  );
}
