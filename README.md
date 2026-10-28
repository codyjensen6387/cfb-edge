# CFB Edge

Personal board of FBS games with each team's record, ATS record, over/under record,
offense/defense per-game rankings, and player prop consistency. Games get flagged when both
teams are hitting the over, both are hitting the under, or a strong ATS team plays a weak one.
Tap a team name to see its full schedule against the line.

## How data gets to the site

A GitHub Action (`.github/workflows/update-data.yml`) runs twice a day, pulls the season
from CollegeFootballData.com, and saves it to `data/season.json`. Vercel rebuilds the site
from that file. Finished weeks are saved once, so each run uses only a few API calls.

The Action needs your key as a repository secret named `CFBD_API_KEY`
(Settings → Secrets and variables → Actions).

To run it right away instead of waiting: Actions tab → Update data → Run workflow.

## Previewing in a codespace

```bash
git pull
npm run data
npm run dev
```

`npm run data` uses the key in `.env.local` and saves to `data/local/`, which is never
committed, so it can't conflict with the Action's data.

## Publishing changes

The Action also commits to this repo, so pull before pushing:

```bash
git add . && git commit -m "Describe the change" && git pull --rebase && git push
```

## How the numbers work

- ATS and O/U use the closing line: the number most sportsbooks listed for that game
  (ties go to DraftKings, then ESPN Bet, FanDuel, BetMGM, Caesars, William Hill, Bovada).
  CFBD's averaged "consensus" entry is only a fallback. Each game card shows which book
  the line came from. Pushes are left out of percentages.
- Team records and rankings are current season totals, on every week's view.
- Player prop thresholds sit around each player's own average: the average rounded down
  (to 50 yards for passing, 25 for rushing and receiving, whole TDs for passing TDs,
  whole catches for receptions),
  plus one step below and one above. Green means the player hit it at or above the
  flag percentage.
- A player's games are the games he recorded a pass, rush or catch.
- Top props this week ranks the players shown under each game by how many of their own
  benchmarks they clear at the flag % or better, then by overall hit rate (3+ games).
- The Kickoff menu on the props page filters by day and Saturday window (Central time).
- In the current week, games move to a hidden section at the bottom once kickoff passes.
- The conference menu shows a game if either team's conference is selected, and
  remembers your choices on each device.
