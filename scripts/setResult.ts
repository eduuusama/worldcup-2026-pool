/**
 * Manual result override / helper for the scheduled updater.
 *
 *   npm run set-result <matchId> <1|X|2> [scoreA] [scoreB] [source]
 *   npm run set-result 5 1 2 1 https://www.fifa.com/...
 *   npm run set-result 5 clear           # reset a match back to pending
 *
 * `outcome` is in the sheet's orientation: 1 = teamA wins, X = draw, 2 = teamB wins.
 * Look up which team is teamA / teamB in data/matches.json before setting.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const resultsPath = path.join(ROOT, "data", "results.json");
const matchesPath = path.join(ROOT, "data", "matches.json");

const [, , idArg, outcomeArg, scoreAArg, scoreBArg, sourceArg] = process.argv;

if (!idArg || !outcomeArg) {
  console.error("Usage: npm run set-result <matchId> <1|X|2|clear> [scoreA] [scoreB] [source]");
  process.exit(1);
}

const id = String(parseInt(idArg, 10));
const matches = JSON.parse(fs.readFileSync(matchesPath, "utf8")) as Array<{
  id: number;
  teamA: string;
  teamB: string;
}>;
const match = matches.find((m) => String(m.id) === id);
if (!match) {
  console.error(`No match with id ${id} in matches.json`);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
const today = new Date().toISOString().slice(0, 10);

if (/^(clear|null|-|reset)$/i.test(outcomeArg)) {
  results[id] = { outcome: null, scoreA: null, scoreB: null, status: "scheduled", source: null, updatedAt: today };
  console.log(`Cleared match #${id} (${match.teamA} vs ${match.teamB}) -> pending`);
} else {
  const outcome = outcomeArg.toUpperCase();
  if (!["1", "X", "2"].includes(outcome)) {
    console.error(`Outcome must be 1, X, or 2 (got "${outcomeArg}")`);
    process.exit(1);
  }
  results[id] = {
    outcome,
    scoreA: scoreAArg != null ? Number(scoreAArg) : null,
    scoreB: scoreBArg != null ? Number(scoreBArg) : null,
    status: "final",
    source: sourceArg ?? null,
    updatedAt: today,
  };
  const winner = outcome === "1" ? match.teamA : outcome === "2" ? match.teamB : "Draw";
  console.log(`Set match #${id} (${match.teamA} vs ${match.teamB}) -> ${outcome} (${winner})`);
}

fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2) + "\n");
