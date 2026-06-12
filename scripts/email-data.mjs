/**
 * Emit the data needed for the daily recap email as JSON.
 *
 *   node scripts/email-data.mjs "Jun 11"
 *
 * Output:
 *   {
 *     day, dayResults: [{id, group, teamA, teamB, scoreA, scoreB, outcome}],
 *     before: [{rank, name, slug, points, correct, played}],   // standings excluding that day
 *     after:  [...same, full top list...],
 *     movements: { enteredTop5, leftTop5, deltas: [{name, from, to}] }
 *   }
 *
 * Standings replicate lib/scoring.ts exactly: 10 pts per correct pick,
 * competition ranking (ties share a rank), sorted by points desc then name.
 * "Before" is computed by only counting decided matches whose sheet date
 * differs from the target day — no snapshots needed.
 */
import fs from "node:fs";
import path from "node:path";

const POINTS_PER_CORRECT = 10;
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const DATA = path.join(ROOT, "..", "data");

const day = process.argv[2];
if (!day) {
  console.error('usage: node scripts/email-data.mjs "Jun 11"');
  process.exit(1);
}

const matches = JSON.parse(fs.readFileSync(path.join(DATA, "matches.json"), "utf8"));
const players = JSON.parse(fs.readFileSync(path.join(DATA, "predictions.json"), "utf8"));
const results = JSON.parse(fs.readFileSync(path.join(DATA, "results.json"), "utf8"));

function standings(matchFilter) {
  const rows = players.map((p) => {
    let correct = 0;
    let played = 0;
    for (const m of matches) {
      if (!matchFilter(m)) continue;
      const r = results[String(m.id)];
      if (!r?.outcome) continue;
      played++;
      if (p.picks[String(m.id)] === r.outcome) correct++;
    }
    return { name: p.name, slug: p.slug, points: correct * POINTS_PER_CORRECT, correct, played };
  });
  rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let rank = 0;
  let prevPts = null;
  rows.forEach((r, i) => {
    if (r.points !== prevPts) {
      rank = i + 1;
      prevPts = r.points;
    }
    r.rank = rank;
  });
  return rows;
}

const before = standings((m) => m.date !== day);
const after = standings(() => true);

const dayResults = matches
  .filter((m) => m.date === day)
  .map((m) => {
    const r = results[String(m.id)] ?? {};
    return {
      id: m.id,
      group: m.group,
      teamA: m.teamA,
      teamB: m.teamB,
      scoreA: r.scoreA,
      scoreB: r.scoreB,
      outcome: r.outcome ?? null,
    };
  });

const rankBefore = Object.fromEntries(before.map((r) => [r.slug, r.rank]));
const top5After = new Set(after.filter((r) => r.rank <= 5).map((r) => r.slug));
const top5Before = new Set(before.filter((r) => r.rank <= 5).map((r) => r.slug));

const movements = {
  enteredTop5: after.filter((r) => top5After.has(r.slug) && !top5Before.has(r.slug)).map((r) => r.name),
  leftTop5: before.filter((r) => top5Before.has(r.slug) && !top5After.has(r.slug)).map((r) => r.name),
  deltas: after
    .map((r) => ({ name: r.name, from: rankBefore[r.slug], to: r.rank }))
    .filter((d) => d.from !== d.to),
};

console.log(
  JSON.stringify(
    { day, dayResults, before: before.slice(0, 8), after, movements },
    null,
    2
  )
);
