# Bug Detective Worker

Daily seed + leaderboard for Bug Detective.

## Endpoints

| Method | Path             | Description                                 |
| ------ | ---------------- | ------------------------------------------- |
| GET    | `/seed`          | `?date=YYYY-MM-DD` → `{ date, seed }`       |
| GET    | `/leaderboard`   | `?date=&puzzleId=` → `{ scores: [...] }`    |
| POST   | `/score`         | body: see below → `{ rank }`                |
| OPTIONS| `*`              | CORS preflight                              |

### `/score` POST body

```json
{
  "date": "2026-04-18",
  "puzzleId": "bug-detective-v1",
  "score": 692,
  "cluesUsed": 0,
  "elapsedMs": 77600,
  "name": "alice"
}
```

Validation:
- `score` ∈ `[0, 1_000_000]`
- `cluesUsed` ∈ `[0, 200]`
- `elapsedMs` ∈ `[0, 600_000]`
- `name` truncated to 16 chars

Sort order (highest first): `score desc`, `cluesUsed asc`, `elapsedMs asc`,
`ts asc`. Stored list is trimmed to 500 entries per `(date, puzzleId)`.

## Daily seed

`dailySeed(date)` is FNV-1a (uint32) of the date string. The same
algorithm is implemented client-side as `fallbackSeed` in
`src/api/seedClient.ts` so the client gracefully degrades when the API
isn't reachable.

## Deploy

```bash
cd bug-detective/worker

# 1. Create the KV namespace (first time only)
npx wrangler kv namespace create BUG_LB --remote
# → copy the returned id and paste into wrangler.toml

# 2. Deploy
npx wrangler deploy
# → captures the deployed URL, e.g.
#   https://bug-detective-api.<account>.workers.dev
```

Set `VITE_LEADERBOARD_API` in your Cloudflare Pages env vars (or local
`.env`) to that URL so the client can reach the worker:

```
VITE_LEADERBOARD_API=https://bug-detective-api.<account>.workers.dev
```

## Tests

Run `npm test` from `bug-detective/`. The 12-case worker integration
suite uses an in-memory KV stub so no `wrangler dev` is needed.
