"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { useResults } from "@/lib/results-context";

/** Transient banner shown after an "update scores" action. */
export function UpdateToast() {
  const { t } = useLang();
  const { lastUpdate, error, clearFeedback } = useResults();
  const [visible, setVisible] = useState(false);

  const hasFeedback = !!lastUpdate || !!error;

  useEffect(() => {
    if (!hasFeedback) return;
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 5000);
    const clear = setTimeout(() => clearFeedback(), 5400);
    return () => {
      clearTimeout(hide);
      clearTimeout(clear);
    };
  }, [lastUpdate, error, hasFeedback, clearFeedback]);

  if (!hasFeedback) return null;

  let tone = "border-[var(--line)] bg-[rgba(7,18,13,0.92)]";
  let text: string;
  let detail: string | null = null;

  if (error) {
    tone = "border-rose-500/40 bg-[rgba(40,10,15,0.94)]";
    text = error === "rate_limited" ? t("update_ratelimit") : t("update_error");
  } else if (lastUpdate && lastUpdate.updated > 0) {
    tone = "border-[var(--accent)]/50 bg-[rgba(7,28,18,0.94)]";
    text = t("update_new", { n: lastUpdate.updated });
    detail = lastUpdate.items
      .map((it) => `${it.flagA} ${it.teamAEs} ${it.scoreA}–${it.scoreB} ${it.teamBEs} ${it.flagB}`)
      .join(" · ");
  } else {
    text = t("update_none");
  }

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 top-[68px] z-30 max-w-[calc(100vw-24px)] rounded-xl border px-4 py-2.5 backdrop-blur-md shadow-lg transition-all duration-300 ${tone} ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
      role="status"
    >
      <p className="text-sm font-semibold text-white">{text}</p>
      {detail && <p className="text-xs text-[var(--muted)] mt-0.5 tnum">{detail}</p>}
    </div>
  );
}
