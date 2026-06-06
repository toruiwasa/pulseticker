# pulseticker — Claude Code Context

## Project

Real-time stock monitoring dashboard. Portfolio project targeting Australian SE job applications.

- **Frontend**: Angular (Vercel) — `apps/web/`
- **Backend**: NestJS (Render) — `apps/api/`
- **Database / Auth**: Supabase (PostgreSQL + OAuth2 via GitHub)
- **Queue**: BullMQ + Upstash Redis
- **Data source**: Finnhub API (WebSocket for live prices)
- **Package manager**: pnpm workspaces

## Implementation Plan

See [PLAN.md](./PLAN.md) for the full implementation plan including:

- Repository structure and scaffolding commands
- Git strategy and commit points (14 commits across 4 phases)
- Supabase schema with RLS policies (per-operation: SELECT/INSERT/UPDATE/DELETE)
- Phase-by-phase development order:
  - Phase 1 — scaffold + GitHub OAuth + deploy skeleton
  - Phase 2 — Finnhub WebSocket relay + watchlist CRUD
  - Phase 3 — BullMQ alert queue + in-app notifications
  - Phase 4 — health endpoint + tests + README
- NestJS module wiring (ConfigModule, AuthModule, AlertsModule)
- Key implementation details for FinnhubService, PricesGateway, AlertsProcessor, SocketService
- Environment variable reference
- Deployment checklist (Render + Vercel + Upstash)
- Known pitfalls (circular deps, WebSocket guards, BullMQ package choice)

## Key Principles

- Deploy-first: Phase 1 must be live before adding features
- No mock data — real Finnhub prices only
- NestJS + Angular are intentional learning targets (developer has 6yr TS/Node/React experience but is new to both frameworks)
- Commit once per completed feature (not per file)
