# Gran Quinela Mundialista 2026 🏆

A World Cup 2026 prediction pool (1 / X / 2) for friends — leaderboard + per-player
profile pages, bilingual (ES/EN), with match results that auto-update from the internet.

- **Format:** each player predicts every group-stage match — `1` (first team wins),
  `X` (draw), `2` (second team wins). **1 point per correct pick.**
- **No database.** Predictions and results live as data files; the leaderboard is computed.
- **Stack:** Next.js (App Router) + TypeScript + Tailwind v4. Deploys to Vercel.

## Add a player

1. Drop their filled Excel into **`data/predictions/`**.
2. **Name the file after the person** — e.g. `Maria.xlsx` → shows as "Maria".
   (Or type the name into the "Your Name:" header cell; that wins over the filename.)
3. Commit + push (or redeploy). The build parses every `.xlsx` automatically.

The importer detects columns by their headers (`#`, `Grp`, `Match`, `Your Name:`), so it
works whether the file was saved from Excel, Google Sheets, or Numbers, and with ES or EN
headers. It resolves each match by the **teams that played**, not the row order.

```bash
npm run import   # parse spreadsheets -> data/matches.json + data/predictions.json
npm run dev      # local dev on http://localhost:8080  (runs import first)
npm run build    # production build (runs import first)
```

## Update a result by hand

Results normally update automatically (see below), but you can always override:

```bash
# npm run set-result <matchId> <1|X|2> [scoreA] [scoreB] [source]
npm run set-result 1 2 0 2 https://www.fifa.com/...   # team B won 0–2
npm run set-result 5 clear                            # back to pending
```

`outcome` is in the **sheet's orientation**: `1` = the match's first-listed team (teamA),
`2` = the second (teamB). Check `data/matches.json` to see which side is which.

## Auto-updating results

A scheduled cloud agent runs a few times a day, web-searches matches that have finished,
writes them into `data/results.json` (via `set-result`), and pushes — Vercel redeploys and
the leaderboard updates. The agent's playbook is **[`scripts/update-results.md`](scripts/update-results.md)**.

## Data files

| File | Source | Notes |
|---|---|---|
| `data/predictions/*.xlsx` | you | one per player — the source of truth |
| `data/matches.json` | generated | the 72 group matches (teamA = "1" side) |
| `data/predictions.json` | generated | each player's picks |
| `data/results.json` | seeded + auto-updated | the only file that changes during the tournament |
| `data/teams.json` | curated | team names (ES/EN) + flag emoji |

Knockout rounds can be added after the group stage, once those matchups exist.
