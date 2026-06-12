import type { TeamInfo } from "./types";
import type { RecapData } from "./standings";

/**
 * Render the daily recap email (Spanish) as inline-styled HTML.
 * Mirrors scripts/email-template.html (light-green theme). Results and
 * standings are deterministic; `recapEs` and `funFactEs` are the AI-written
 * prose blocks (the exciting/funny moment and the "dato mundialista").
 */

const C = {
  bg: "#F0FDF4",
  card: "#FFFFFF",
  cardBorder: "#DCFCE7",
  heading: "#14532D",
  text: "#374151",
  muted: "#6B7280",
  faint: "#9CA3AF",
  green: "#16A34A",
  hr: "#F3F4F6",
  factBg: "#ECFDF5",
  factBorder: "#A7F3D0",
  factText: "#065F46",
  warnBg: "#FFFBEB",
  warnBorder: "#FDE68A",
  warnText: "#B45309",
};

const SITE = "https://gran-quinela-mundialista.vercel.app";
const MEDALS = ["🥇", "🥈", "🥉"];
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function team(name: string, teams: Record<string, TeamInfo>) {
  const t = teams[name];
  return { label: t ? t.es : name, flag: t ? t.flag : "🏳️" };
}

export interface RecapEmailInput {
  recap: RecapData;
  recapEs: string; // 🔥 exciting / funny moment paragraph(s)
  funFactEs: string; // 💡 dato mundialista
  teams: Record<string, TeamInfo>;
  dateLabelEs: string; // e.g. "jueves 11 de junio de 2026"
  decided: number; // total matches decided so far
  totalMatches: number; // 72
}

export function buildRecapEmail(input: RecapEmailInput): { subjectHint: string; html: string } {
  const { recap, recapEs, funFactEs, teams, dateLabelEs, decided, totalMatches } = input;

  const card = (inner: string, style = "") =>
    `<tr><td style="background:${C.card};border:1px solid ${C.cardBorder};border-radius:12px;padding:20px 24px;${style}">${inner}</td></tr><tr><td style="height:14px;"></td></tr>`;

  // 📋 Results
  const resultRows = recap.dayResults
    .map((r, i) => {
      const a = team(r.teamA, teams);
      const b = team(r.teamB, teams);
      const winLabel = r.outcome === "1" ? "«1»" : r.outcome === "2" ? "«2»" : "«X»";
      const border = i === 0 ? "" : `border-top:1px solid ${C.hr};`;
      const score = r.scoreA != null && r.scoreB != null ? `${r.scoreA} – ${r.scoreB}` : "vs";
      return `<tr><td style="padding:8px 0;${border}">${a.flag} ${esc(a.label)} <strong>${score}</strong> ${esc(b.label)} ${b.flag} <span style="color:${C.faint};font-size:12px;">· Grupo ${esc(r.group)} · ganó el ${winLabel}</span></td></tr>`;
    })
    .join("");

  // 📊 Top 5
  const top = recap.after.slice(0, 5);
  const leadersTied = recap.after.filter((r) => r.rank === 1).length;
  const standingRows = top
    .map((r, i) => {
      const medal = r.rank <= 3 ? MEDALS[r.rank - 1] : `${r.rank}.`;
      const border = i === 0 ? "" : `border-top:1px solid ${C.hr};`;
      const acc = r.played ? ` <span style="color:${C.faint};font-size:12px;">· ${r.correct}/${r.played} ✓</span>` : "";
      return `<tr><td style="padding:6px 0;${border}">${medal} <strong>${esc(r.name)}</strong>${acc}</td><td align="right" style="color:${C.green};font-weight:bold;${border}">${r.points} pts</td></tr>`;
    })
    .join("");

  const tiedNote =
    leadersTied > 5
      ? `<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${C.text};">🤝 <strong>${leadersTied} empatados</strong> en la cima con ${recap.after[0].points} pts — todavía sin escapadas.</p>`
      : "";

  const up = recap.movements.enteredTop5;
  const down = recap.movements.leftTop5;
  let moveNote = "";
  if (up.length) {
    moveNote += `<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${C.text};">📈 <strong>${esc(up.join(", "))}</strong> ${up.length > 1 ? "se metieron" : "se metió"} al Top 5. ¡A celebrar!</p>`;
  }
  if (down.length) {
    moveNote += `<p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:${C.warnText};background:${C.warnBg};border:1px solid ${C.warnBorder};border-radius:8px;padding:10px 12px;">📉 <strong>${esc(down.join(", "))}</strong> ${down.length > 1 ? "salieron" : "salió"} del Top 5. ¡A remontar!</p>`;
  }
  if (!up.length && !down.length) {
    moveNote = `<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${C.text};">Sin cambios en el Top 5 — el podio aguantó. 🧱</p>`;
  }

  const html = `<!DOCTYPE html>
<html lang="es"><body style="margin:0;padding:0;background-color:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.bg};padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <tr><td style="padding:0 8px 16px;">
    <div style="font-size:26px;">🏆⚽</div>
    <h1 style="margin:6px 0 2px;font-size:22px;color:${C.heading};">Gran Quinela Mundialista</h1>
    <p style="margin:0;font-size:13px;color:${C.muted};">RMP / PEYITO · Resumen del ${esc(dateLabelEs)}</p>
  </td></tr>

  ${card(`<h2 style="margin:0 0 10px;font-size:16px;color:${C.heading};">🔥 Lo más destacado de ayer</h2><div style="font-size:14px;line-height:1.6;color:${C.text};">${recapEs}</div>`)}

  ${card(`<h2 style="margin:0 0 12px;font-size:16px;color:${C.heading};">📋 Resultados de la jornada</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${C.text};">${resultRows}</table>`)}

  ${card(`<h2 style="margin:0 0 4px;font-size:16px;color:${C.heading};">📊 Así va la tabla (Top 5)</h2><p style="margin:0 0 12px;font-size:12px;color:${C.muted};">10 pts por acierto · ${decided} de ${totalMatches} partidos jugados</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${C.text};">${standingRows}</table>${tiedNote}${moveNote}`)}

  ${card(`<h2 style="margin:0 0 8px;font-size:16px;color:${C.factText};">💡 Dato mundialista</h2><div style="font-size:14px;line-height:1.6;color:${C.factText};">${funFactEs}</div>`, `background:${C.factBg};border-color:${C.factBorder};`)}

  <tr><td align="center"><a href="${SITE}" style="display:inline-block;background:${C.green};color:#FFFFFF;font-size:14px;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:8px;">Ver tabla completa y pronósticos</a></td></tr>
  <tr><td style="height:20px;"></td></tr>
  <tr><td align="center" style="padding:0 8px;"><p style="margin:0;font-size:11px;color:${C.faint};">Gran Quinela Mundialista RMP / PEYITO · Mundial 2026 🇲🇽🇺🇸🇨🇦 · Resumen diario automático</p></td></tr>

</table></td></tr></table></body></html>`;

  const subjectHint = recap.dayResults
    .map((r) => `${team(r.teamA, teams).label} ${r.scoreA}-${r.scoreB} ${team(r.teamB, teams).label}`)
    .join(" · ");

  return { subjectHint, html };
}
