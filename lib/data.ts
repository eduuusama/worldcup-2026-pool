import matchesJson from "@/data/matches.json";
import predictionsJson from "@/data/predictions.json";
import resultsJson from "@/data/results.json";
import teamsJson from "@/data/teams.json";
import type { Lang, Match, Player, Results, TeamInfo } from "./types";

export const matches = matchesJson as Match[];
export const players = predictionsJson as Player[];
export const results = resultsJson as Results;
const teams = teamsJson as Record<string, TeamInfo>;

/** Ordered list of the 12 group letters present in the data. */
export const groups: string[] = [...new Set(matches.map((m) => m.group))].sort();

export function getPlayer(slug: string): Player | undefined {
  return players.find((p) => p.slug === slug);
}

export function matchesOf(group: string): Match[] {
  return matches.filter((m) => m.group === group);
}

export function matchById(id: number | string): Match | undefined {
  return matches.find((m) => String(m.id) === String(id));
}

/** Localised display name + flag for a team key as written in the spreadsheet. */
export function teamInfo(name: string, lang: Lang): { name: string; flag: string } {
  const t = teams[name];
  if (!t) return { name, flag: "🏳️" };
  return { name: lang === "es" ? t.es : t.en, flag: t.flag };
}

/** How many matches have a final result. */
export function decidedCount(r: Results = results): number {
  return Object.values(r).filter((e) => e.outcome !== null).length;
}

/** Most recent result update across all matches (ISO date string or null). */
export function lastUpdated(r: Results = results): string | null {
  const dates = Object.values(r)
    .map((e) => e.updatedAt)
    .filter((d): d is string => !!d)
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}
