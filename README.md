# Cody's Sports Trends

College football, college basketball and Champions League betting-research boards, plus a
Line Movement tool, on one site; switch sections at the top.

Personal board of FBS games with each team's record, ATS record, over/under record,
offense/defense per-game rankings, and player prop consistency. Games get flagged when both
teams are hitting the over, both are hitting the under, or a strong ATS team plays a weak one.
Tap a team name to see its full schedule against the line.

## Basketball

- Power-conference teams only (ACC, Big 12, Big East, Big Ten, SEC, Pac-12). Their games against
  other schools are shown, with records and props for the power team only.
- Pick a day instead of a week. Top props for the day covers each power team's top 5 players by
  minutes: points (book-style steps 5, 8, 10, 12, 15, 18, 20, 22, 25...), rebounds (every number
  from 4), assists and 3-pointers made (every number from 1).
- Data comes from CollegeBasketballData.com with the same CFBD_API_KEY.
  `npm run data:basketball` pulls just basketball; `npm run data` pulls both.

## Soccer (Champions League)

- Champions League matches only, from ESPN's public feed (no key; unofficial, so it can change).
- Team stats: W-D-L, goals for and against per match overall, at home and away. On a match card
  the home team's home split and the away team's away split are highlighted. Each card lists
  both teams' Champions League results this season.
- Player props for each team's top 6 by shots (goals count double): goals (1+, 2+), shots and
  shots on target (three steps around his average), goals + assists (1+, 2+).
- `npm run data:soccer` pulls just soccer.

## Line Movement

Paste the Splash Sports picks page (select all, copy, paste). The site reads every game's
spread and total, saves the paste on that device, and compares it with current lines:
college from the last site update until you tap Refresh (then live from CollegeFootballData,
one API call, with ESPN as a backup), NFL live from ESPN. Games are sorted by how far the line
moved, with the side that now has the better number, and key numbers (3, 7, 10) flagged.
The live lines come from `app/api/lines/route.js`, which runs on Vercel.

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
- Touchdown rows show 2+ and 3+ TD only when hit in at least half his games, plus his current
  streak (or how many games since his last TD). The TD list sorts by TD rate, then streak.
- Top props this week ranks the players shown under each game by how many of their own
  benchmarks they clear at the flag % or better, then by overall hit rate (3+ games).
- The Kickoff menu on the props page filters by day and Saturday window (Central time).
- In the current week, games move to a hidden section at the bottom once kickoff passes.
- The conference menu shows a game if either team's conference is selected, and
  remembers your choices on each device.
