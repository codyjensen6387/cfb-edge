# CFB Edge

Personal board of upcoming FBS games with each team's record, ATS record, over/under record,
and offense/defense per-game rankings. Games get flagged when both teams are hitting the over,
both are hitting the under, or a strong ATS team plays a weak one.

## Setup

1. Get a free API key at https://collegefootballdata.com/key
2. Install and copy the env file:

```bash
npm install
cp .env.example .env.local
```

3. Open `.env.local`, paste your key after `CFBD_API_KEY=`, then run:

```bash
npm run dev
```

4. Open http://localhost:3000

## Deploy to Vercel

Push the folder to a GitHub repo, import it in Vercel, and add this environment variable:

```
CFBD_API_KEY=your_key_here
```

## How the numbers work

- ATS and O/U use the closing consensus line (the "consensus" book when listed,
  otherwise the median of all books). Pushes are left out of percentages.
- Games with no posted line (common vs FCS opponents) don't count toward ATS or O/U.
- Rankings are per game among FBS teams. Defense: fewest allowed = #1.
- Data refreshes at most every 6 hours; past weeks' box scores are cached for a week
  to keep API usage low.
