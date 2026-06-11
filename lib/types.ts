export type Pick = "1" | "X" | "2";
export type Lang = "es" | "en";

export interface Match {
  id: number;
  group: string; // "A".."L"
  teamA: string; // the "1" side
  teamB: string; // the "2" side
  date: string;
}

export interface Player {
  slug: string;
  name: string;
  picks: Record<string, Pick>;
}

export interface ResultEntry {
  outcome: Pick | null;
  scoreA: number | null;
  scoreB: number | null;
  status: "scheduled" | "final";
  source: string | null;
  updatedAt: string | null;
}

export type Results = Record<string, ResultEntry>;

export interface TeamInfo {
  en: string;
  es: string;
  flag: string;
}
