"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Lang } from "./types";

type Dict = Record<string, string>;

const MESSAGES: Record<Lang, Dict> = {
  es: {
    subtitle: "RMP / PEYITO",
    legend: "1 = gana el primero · X = empate · 2 = gana el segundo · 10 pts por acierto",
    nav_leaderboard: "Tabla",
    nav_matches: "Partidos",
    nav_bracket: "Eliminatorias",
    bracket_title: "Fase de Eliminación",
    bracket_points_title: "Puntos por acierto (se calculan al consolidar)",
    bracket_loading: "Cargando el cuadro…",
    bracket_champion: "Campeón",
    round_r32: "32avos",
    round_r16: "Octavos",
    round_qf: "Cuartos",
    round_sf: "Semifinal",
    round_bronze: "Tercer lugar",
    round_final: "Final",
    day_today: "Hoy",
    day_tomorrow: "Mañana",
    tbd: "Por definir",
    update_scores: "Actualizar",
    updating: "Actualizando…",
    update_new: "✓ {n} marcador(es) actualizado(s)",
    update_none: "Todo al día ✓",
    update_error: "No se pudo actualizar",
    update_ratelimit: "Demasiados intentos, espera un momento",
    leaderboard_title: "Tabla de Posiciones",
    decided: "{n} / {total} partidos definidos",
    updated: "Actualizado {date}",
    never_updated: "Sin resultados aún",
    col_rank: "#",
    col_player: "Jugador",
    col_points: "Pts",
    col_correct: "Aciertos",
    col_acc: "Prec.",
    empty_players: "Aún no hay jugadores. Coloca un Excel en data/predictions y vuelve a desplegar.",
    profile_back: "Tabla de Posiciones",
    stat_points: "Puntos",
    stat_correct: "Aciertos",
    stat_accuracy: "Precisión",
    stat_pending: "Pendientes",
    stat_rank: "Posición",
    stat_best_group: "Mejor grupo",
    group_label: "Grupo {g}",
    th_match: "Partido",
    th_pick: "Pronóstico",
    th_result: "Resultado",
    pick_draw: "Empate",
    matches_title: "Partidos y Resultados",
    got_it_right: "{n}/{total} aciertos",
    result_pending: "Pendiente",
    result_draw: "Empate",
    back_matches: "Partidos",
    match_where: "Dónde",
    match_when: "Cuándo (hora El Salvador)",
    match_tbd: "Por confirmar",
    match_final: "Final",
    match_picks_title: "Pronósticos de los participantes",
    pick_wins: "gana",
    pick_group_draw: "Empate",
    nobody: "Nadie",
    n_people: "{n}",
    legend_short: "1 · X · 2",
    of: "de",
    footer: "Gran Quinela Mundialista · actualizado automáticamente desde internet",
    no_pick: "—",
  },
  en: {
    subtitle: "RMP / PEYITO",
    legend: "1 = first team wins · X = draw · 2 = second team wins · 10 pts per correct pick",
    nav_leaderboard: "Leaderboard",
    nav_matches: "Matches",
    nav_bracket: "Bracket",
    bracket_title: "Knockout Stage",
    bracket_points_title: "Points per correct pick (tallied at consolidation)",
    bracket_loading: "Loading the bracket…",
    bracket_champion: "Champion",
    round_r32: "Round of 32",
    round_r16: "Round of 16",
    round_qf: "Quarterfinals",
    round_sf: "Semifinals",
    round_bronze: "Third place",
    round_final: "Final",
    day_today: "Today",
    day_tomorrow: "Tomorrow",
    tbd: "TBD",
    update_scores: "Update",
    updating: "Updating…",
    update_new: "✓ {n} score(s) updated",
    update_none: "All up to date ✓",
    update_error: "Couldn't update",
    update_ratelimit: "Too many tries — wait a moment",
    leaderboard_title: "Leaderboard",
    decided: "{n} / {total} matches decided",
    updated: "Updated {date}",
    never_updated: "No results yet",
    col_rank: "#",
    col_player: "Player",
    col_points: "Pts",
    col_correct: "Correct",
    col_acc: "Acc.",
    empty_players: "No players yet. Drop an Excel file in data/predictions and redeploy.",
    profile_back: "Leaderboard",
    stat_points: "Points",
    stat_correct: "Correct",
    stat_accuracy: "Accuracy",
    stat_pending: "Pending",
    stat_rank: "Rank",
    stat_best_group: "Best group",
    group_label: "Group {g}",
    th_match: "Match",
    th_pick: "Pick",
    th_result: "Result",
    pick_draw: "Draw",
    matches_title: "Fixtures & Results",
    got_it_right: "{n}/{total} right",
    result_pending: "Pending",
    result_draw: "Draw",
    back_matches: "Matches",
    match_where: "Where",
    match_when: "When (El Salvador time)",
    match_tbd: "TBD",
    match_final: "Final",
    match_picks_title: "Participants' picks",
    pick_wins: "win",
    pick_group_draw: "Draw",
    nobody: "Nobody",
    n_people: "{n}",
    legend_short: "1 · X · 2",
    of: "of",
    footer: "Gran Quinela Mundialista · auto-updated from the internet",
    no_pick: "—",
  },
};

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggle: () => void;
  t: (key: keyof typeof MESSAGES["en"], vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("lang")) as Lang | null;
    if (saved === "es" || saved === "en") setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("lang", l);
    if (typeof document !== "undefined") document.documentElement.lang = l;
  }, []);

  const toggle = useCallback(() => setLang(lang === "es" ? "en" : "es"), [lang, setLang]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = MESSAGES[lang][key] ?? MESSAGES.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [lang]
  );

  return <Ctx.Provider value={{ lang, setLang, toggle, t }}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang must be used within LanguageProvider");
  return c;
}
