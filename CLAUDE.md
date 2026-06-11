# pulseticker — Claude Code Context

## Project

Real-time stock monitoring dashboard. Portfolio project targeting Australian SE job applications.

- **Frontend**: Angular (Vercel) — `apps/web/`
- **Backend**: NestJS (Render) — `apps/api/`
- **Database / Auth**: Supabase (PostgreSQL + OAuth2 via GitHub)
- **Queue**: Graphile Worker (Supabase PostgreSQL)
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
  - Phase 3 — Graphile Worker alert queue + in-app notifications
  - Phase 4 — health endpoint + tests + README
- NestJS module wiring (ConfigModule, AuthModule, AlertsModule)
- Key implementation details for FinnhubService, PricesGateway, AlertsService (in-memory cache), QueueService
- Environment variable reference
- Deployment checklist (Render + Vercel)
- Known pitfalls (circular deps, WebSocket guards, Graphile Worker requires Session Pooler DATABASE_URL on IPv4 platforms like Render)

## Git Workflow

- **Branch per task**: Always create a new branch before starting any task (`git checkout -b <short-descriptor>`).
- Commit on the branch; merge into `main` when the task is complete.
- Branch names should be short and descriptive (e.g. `feat/symbol-search`, `fix/alert-oanda-display`).

## Key Principles

- Deploy-first: Phase 1 must be live before adding features
- No mock data — real Finnhub prices only
- NestJS + Angular are intentional learning targets (developer has 6yr TS/Node/React experience but is new to both frameworks)
- Commit once per completed feature (not per file)

## Testing

- **Boundary-first**: Always test application boundaries — HTTP controllers, WebSocket gateways, pipes. Internal service logic is tested only where needed to reach the coverage target.
- **Coverage target**: 90–95% per changed file. Verify with `pnpm --filter api test:cov` / `pnpm --filter web test:cov`.
- **No Angular TestBed for pure logic**: Pipes and utility functions are instantiated directly in Jest.
- **Mock external I/O**: Supabase client, `fetch`, and Socket.io are always mocked — never hit real services in unit tests.

## Database Migrations

- **Always dry-run first**: Before applying any migration, test it in a transaction that you roll back:
  ```sql
  BEGIN;
  -- paste migration SQL here
  ROLLBACK;
  ```
  Confirm the SQL executes without errors before writing the migration file and running `supabase db push`.

- **Destructive column changes use expand-contract** — never drop a column in the same migration that creates its replacement:
  1. **Expand** — add the new column (nullable or with a safe default); deploy app code that writes both columns.
  2. **Migrate** — backfill existing rows: `UPDATE table SET new_col = old_col WHERE new_col IS NULL;`
  3. **Contract** — drop the old column only after verifying every row is migrated and no code reads the old column.
  Each step is a separate, independently deployable migration file.

- **No data loss without explicit confirmation**: If a migration deletes or irreversibly transforms existing data, stop and confirm with the user before running `supabase db push`.

## Planning Artifacts

- `plans/` is committed to the repository. It contains per-requirement planning documents and mockups (e.g. `plans/REQ-13_Mockup.png`). Always commit new files added here.
