# pulseticker

Real-time stock monitoring dashboard with WebSocket price streaming and
threshold-based alerts. Built as a portfolio project to demonstrate OAuth2,
event-driven backends, and real-time UI updates.

## Architecture

```
┌─────────────┐ HTTP/REST  ┌──────────────┐  service role  ┌──────────┐
│   Angular   │ ─────────▶ │   NestJS     │ ─────────────▶ │ Supabase │
│   (Vercel)  │            │   (Render)   │                │ Postgres │
│             │ ◀────────── │              │                │ + Auth   │
│  Socket.io  │  /prices    │  Socket.io   │                └──────────┘
└─────┬───────┘             │   Gateway    │
      │ JWT (ES256)         │              │ trades  ┌──────────┐
      ▼                     │  Finnhub WS  │ ◀────── │ Finnhub  │
   GitHub                   │   client     │         └──────────┘
   OAuth ───▶ Supabase Auth │              │
                            │  Graphile    │ jobs    ┌──────────┐
                            │  Worker      │ ──────▶ │ Supabase │
                            │  (alerts)    │         │ Postgres │
                            └──────────────┘         └──────────┘
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Angular 22 (standalone components, zoneless, signals) |
| Backend | NestJS 11 (Graphile Worker, Socket.io, terminus) |
| Auth | Supabase GitHub OAuth (PKCE, ES256 JWT verified via JWKS) |
| Database | Supabase Postgres with row-level security |
| Queue | Graphile Worker on Supabase PostgreSQL |
| Prices | Finnhub WebSocket API (US market hours) |
| Tooling | pnpm workspaces + Turborepo |

## Local setup

1. Copy `.env.example` → `.env` at the repo root. Required vars:
   ```
   SUPABASE_URL=                  # https://<ref>.supabase.co
   SUPABASE_SECRET_KEY=           # service role JWT
   SUPABASE_PUBLISHABLE_KEY=      # anon/publishable JWT (browser-safe)
   FINNHUB_API_KEY=
   DATABASE_URL=                  # Supabase Session Pooler URI (port 5432)
   API_URL=http://localhost:3000
   WS_URL=http://localhost:3000
   CORS_ORIGIN=http://localhost:4200
   ```

2. Apply the schema from [PLAN.md](./PLAN.md) (Phase 1, SQL block) including
   the `GRANT ALL ... TO service_role` block at the bottom.

3. ```
   pnpm install
   pnpm dev          # api on :3000, web on :4200
   ```

4. Log in with GitHub. Add a symbol via `POST /watchlist {"symbol":"AAPL"}`
   (use the auth token from browser `localStorage["sb-…-auth-token"]`).
   Prices stream during US market hours (EST 9:30–16:00).

## Tests

```
pnpm --filter api test:cov     # 55 unit tests — watchlist, alerts, gateway, queue
```

## Deployment

| Service | Setup |
|---|---|
| Render (api) | Root `apps/api`, build `pnpm install && pnpm run build`, start `node dist/main`. Set all env vars + `NODE_ENV=production`, `CORS_ORIGIN=<vercel-url>`. Add `DATABASE_URL` (Supabase Session Pooler URI). Graphile Worker auto-creates its schema on first boot. |
| Vercel (web) | Root `apps/web`, build `tsx scripts/set-env.ts --prod && ng build`, output `dist/web/browser`. Add `vercel.json` rewrites before first deploy. |

Supabase Auth → URL Configuration → Redirect URLs must include
`<vercel-url>/auth/callback` (and `http://localhost:4200/auth/callback` for
local dev).

## Scope

- US-listed equities only (Finnhub free tier)
- Prices arrive only during US market hours; dashboard shows `—` otherwise
- One alert per row, fires once then deactivates (no re-arm logic)
- See [PLAN.md](./PLAN.md) for the full implementation plan and rationale
