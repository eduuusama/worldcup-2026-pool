"use client";

import { useLang } from "@/lib/i18n";

export function Footer() {
  const { t } = useLang();
  return (
    <footer className="border-t border-[var(--line)] mt-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 text-center text-xs text-[var(--muted)]">
        {t("footer")}
      </div>
    </footer>
  );
}
