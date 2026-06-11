"use client";

import { teamInfo } from "@/lib/data";
import { useLang } from "@/lib/i18n";

export function TeamLabel({
  team,
  align = "left",
  className = "",
}: {
  team: string;
  align?: "left" | "right";
  className?: string;
}) {
  const { lang } = useLang();
  const info = teamInfo(team, lang);
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${align === "right" ? "flex-row-reverse text-right" : ""} ${className}`}
    >
      <span className="text-base leading-none">{info.flag}</span>
      <span className="truncate">{info.name}</span>
    </span>
  );
}

/** Small 1 / X / 2 badge. Pass null for an empty/no-pick slot. */
export function Badge({ value }: { value: "1" | "X" | "2" | null }) {
  if (!value) return <span className="badge badge-empty">·</span>;
  return <span className={`badge badge-${value}`}>{value}</span>;
}
