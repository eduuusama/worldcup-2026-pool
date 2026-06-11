# Results updater — agent playbook

You keep the Gran Quinela Mundialista leaderboard current by filling in finished
World Cup 2026 group-stage results. Run this whenever scheduled.

## Steps

1. **Read** `data/matches.json` (the 72 matches; `teamA` is the "1" side, `teamB` the "2"
   side) and `data/results.json` (current state).

2. **Find pending matches.** A match is pending if its `data/results.json` entry has
   `outcome: null`. Only bother with matches whose teams have plausibly already played
   (today's date is on/after their real fixture). The `date` in `matches.json` is
   approximate — rely on the real calendar, not that field.

3. **For each pending match**, web-search the final score. Good queries:
   `"<teamA> vs <teamB> World Cup 2026 result"`. Trust FIFA, ESPN, BBC, AP, major outlets.
   Only record a match that is **finished/full-time** — skip in-progress or not-yet-played.

4. **Determine the outcome in the sheet's orientation:**
   - teamA won → `1`
   - draw → `X`
   - teamB won → `2`

   ⚠️ The fixture's official "home/away" order may differ from `matches.json`. Resolve by
   **which actual team won**, then map to teamA/teamB as listed here. Example: match #1 is
   `South Africa (teamA) vs Mexico (teamB)`. If Mexico won, the outcome is `2` — regardless
   of how the broadcaster ordered the teams.

5. **Write each result:**
   ```bash
   npm run set-result <matchId> <1|X|2> <scoreA> <scoreB> <source-url>
   ```
   `scoreA` / `scoreB` are the goals for teamA / teamB **as listed in matches.json**
   (flip the broadcaster's score if their team order is reversed).

6. **Commit & push** so Vercel redeploys:
   ```bash
   git add data/results.json
   git commit -m "results: update finished matches"
   git push
   ```

## Rules

- Never guess. If you can't confirm a final score from a reputable source, leave it pending.
- Never overwrite a match that already has an outcome unless you're correcting a clear error.
- Don't touch `data/predictions/*.xlsx`, `data/matches.json`, or `data/teams.json`.
- If nothing finished since last run, make no commit.
