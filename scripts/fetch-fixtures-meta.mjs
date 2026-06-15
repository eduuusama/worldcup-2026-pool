/**
 * Fetch venue + kickoff time for each of our 72 fixtures from ESPN's public
 * scoreboard, and write data/fixtures-meta.json keyed by our match id.
 *
 *   node scripts/fetch-fixtures-meta.mjs
 *
 * The schedule is fixed, so this is run occasionally (not on every build). Match
 * rows that ESPN doesn't have yet simply get no meta (the UI shows "TBD").
 * Mapped by unordered team pair — the same approach the result sync uses.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const START = "2026-06-11";
const END = "2026-06-27"; // group stage

const ALIASES = {
  czechia: "czechrepublic",
  korearepublic: "southkorea",
  korea: "southkorea",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  us: "usa",
  usmnt: "usa",
  cotedivoire: "ivorycoast",
  bosniaandherzegovina: "bosniaherzegovina",
  bosnia: "bosniaherzegovina",
  democraticrepublicofthecongo: "drcongo",
  congodr: "drcongo",
  congo: "drcongo",
  caboverde: "capeverde",
  turkiye: "turkey",
};
const canon = (s) => {
  const n = String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  return ALIASES[n] ?? n;
};

function datesFrom(start, end) {
  const out = [];
  const d = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const matches = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "matches.json"), "utf8"));
const byPair = new Map();
for (const m of matches) byPair.set([canon(m.teamA), canon(m.teamB)].sort().join("|"), m);

const meta = {};
let found = 0;
for (const date of datesFrom(START, END)) {
  try {
    const res = await fetch(`${ESPN}?dates=${date.replace(/-/g, "")}`);
    if (!res.ok) continue;
    const data = await res.json();
    for (const ev of data.events ?? []) {
      const comp = ev.competitions?.[0];
      if (!comp) continue;
      const cs = comp.competitors ?? [];
      const h = cs.find((c) => c.homeAway === "home");
      const a = cs.find((c) => c.homeAway === "away");
      if (!h || !a) continue;
      const match = byPair.get([canon(h.team?.displayName), canon(a.team?.displayName)].sort().join("|"));
      if (!match) continue;
      const v = comp.venue ?? {};
      meta[match.id] = {
        kickoff: ev.date ?? null, // ISO UTC
        venue: v.fullName ?? null,
        city: v.address?.city ?? null,
        country: v.address?.country ?? null,
      };
      found++;
    }
  } catch (e) {
    console.warn(`[fixtures-meta] ${date} failed:`, String(e).slice(0, 120));
  }
}

fs.writeFileSync(path.join(ROOT, "data", "fixtures-meta.json"), JSON.stringify(meta, null, 2) + "\n");
console.log(`[fixtures-meta] wrote ${found} fixtures (of ${matches.length}).`);
