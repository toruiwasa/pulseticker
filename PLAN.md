# pulseticker — Implementation Plan

## Context

Build a real-time stock monitoring dashboard as an Australian SE portfolio project demonstrating CRUD-plus skills: OAuth2, WebSocket streaming, and event-driven alerting. Stack uses NestJS + Angular intentionally (developer is learning both). Must use real Finnhub data, no mocks. Deploy-first strategy: ship a working skeleton on Render + Vercel at the end of Phase 1 before adding features.

---

## Repository Structure

pnpm workspaces monorepo (no Nx — avoids extra CLI complexity while learning two new frameworks):

```
pulseticker/
├── package.json              ← workspace root (scripts only, no "workspaces" field)
├── pnpm-workspace.yaml       ← pnpm workspace config (replaces npm "workspaces" field)
├── .gitignore
├── .env.example
├── README.md
└── apps/
    ├── api/                   ← NestJS → Render
    │   └── src/
    │       ├── main.ts
    │       ├── app.module.ts
    │       ├── common/types/  ← shared types (e.g. AuthedRequest)
    │       ├── supabase/      ← shared DB client (@Global module)
    │       ├── auth/          ← SupabaseAuthGuard (jose JWKS, ES256)
    │       ├── watchlist/     ← CRUD controller + service
    │       ├── finnhub/       ← Finnhub WS client (singleton)
    │       ├── gateway/       ← Socket.io PricesGateway (+ spec)
    │       ├── alerts/        ← controller + service + BullMQ processor (+ spec)
    │       └── health/        ← terminus health checks (supabase + redis + memory)
    └── web/                  ← Angular standalone (zoneless + signals) → Vercel
        └── src/app/
            ├── app.ts                                ← root component (keep-alive ping)
            ├── app.config.ts                         ← provideZonelessChangeDetection()
            ├── core/
            │   ├── guards/auth.guard.ts              ← protects /dashboard, /alerts
            │   ├── guards/public-only.guard.ts       ← bounces authed users off /
            │   ├── services/auth.service.ts          ← Supabase client + INITIAL_SESSION
            │   ├── services/socket.service.ts        ← typed Socket.io wrapper
            │   ├── services/api.service.ts
            │   └── interceptors/auth.interceptor.ts
            └── features/
                ├── auth/login/
                ├── auth/callback/
                ├── dashboard/ (watchlist + price-ticker + alert toast)
                └── alerts/ (create form + active alerts list)
```

---

## Git Strategy

### Setup

```bash
cd /Users/wasashi/pulseticker
git init
git add .gitignore   # add .gitignore first before anything else
```

**`.gitignore`** (root):
```
node_modules/
dist/
.env
*.env.local
.pnpm-store/
```

### Branching

- `main` — always deployable; only merge when a phase is complete and deployed
- `phase/1-auth`, `phase/2-websocket`, `phase/3-alerts`, `phase/4-polish` — one branch per phase

### Commit convention (Conventional Commits)

Commit **once per completed feature**, not per file. Stage all related files together.

| Prefix | When |
|---|---|
| `chore:` | Scaffold, config, tooling |
| `feat:` | New working feature |
| `fix:` | Bug fix |
| `test:` | Tests only |
| `docs:` | README, comments |

### Commit points per phase

**Phase 1**
1. `chore: initialize pnpm monorepo with NestJS and Angular`
2. `feat: add Supabase module and shared DB client`
3. `feat: add GitHub OAuth login with Supabase JWT guard`
4. `chore: add vercel.json and health endpoint stub for deployment`

**Phase 2**
5. `feat: add watchlist CRUD API with Supabase RLS`
6. `feat: add Finnhub WebSocket client with exponential backoff reconnect`
7. `feat: add Socket.io prices gateway with per-symbol rooms`
8. `feat: add real-time price display in Angular dashboard`

**Phase 3**
9. `feat: add BullMQ alert queue with Upstash Redis`
10. `feat: add alert CRUD API and processor worker`
11. `feat: add in-app alert notifications (Angular toast)`

**Phase 4**
12. `feat: add health endpoint with @nestjs/terminus`
13. `test: add unit tests for alerts processor and prices gateway`
14. `docs: add README with architecture diagram and setup guide`

---

## Phase 1: Scaffold + Auth + Deploy Skeleton

**Goal: Working OAuth login deployed to production.**

### Scaffolding commands (run in order)

```bash
cd /Users/wasashi/pulseticker

# Root workspace
pnpm init
# Edit package.json: set "private": true, add root scripts (see below)
# Create pnpm-workspace.yaml (see below)

mkdir -p apps

# NestJS backend
pnpm add -g @nestjs/cli
cd apps && nest new api --package-manager pnpm --skip-git
cd api
pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io \
  @nestjs/bullmq bullmq @nestjs/terminus @supabase/supabase-js ws \
  class-validator class-transformer @nestjs/config jose
pnpm add -D @types/ws @types/jest jest ts-jest supertest @types/supertest

# Angular frontend
cd /Users/wasashi/pulseticker/apps
pnpm add -g @angular/cli
ng new web --routing --style css --standalone --skip-git --package-manager pnpm
cd web
pnpm add @supabase/supabase-js socket.io-client
pnpm add -D tsx
```

**`pnpm-workspace.yaml`** (root):
```yaml
packages:
  - 'apps/*'
```

**Root `package.json`**:
```json
{
  "name": "pulseticker",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "dev:api": "pnpm --filter api start:dev",
    "dev:web": "pnpm --filter web start",
    "build:api": "pnpm --filter api build",
    "build:web": "pnpm --filter web build",
    "test:api": "pnpm --filter api test"
  }
}
```

### NestJS module generation (from apps/api/)

```bash
nest generate module supabase && nest generate service supabase/supabase
nest generate module auth && nest generate guard auth/jwt-auth
nest generate module watchlist && nest generate controller watchlist/watchlist && nest generate service watchlist/watchlist
nest generate module finnhub && nest generate service finnhub/finnhub
nest generate module gateway
nest generate module alerts && nest generate controller alerts/alerts && nest generate service alerts/alerts
nest generate module health && nest generate controller health/health
# Create gateway/prices.gateway.ts manually (needs @WebSocketGateway decorator)
# Create alerts/alerts.processor.ts manually (needs @Processor decorator)
# Create auth/supabase-auth.guard.ts manually (JWKS-based CanActivate guard using jose)
```

### NestJS module wiring (required — not generated by CLI)

**`AppModule`** — `ConfigModule` must be first in `imports[]`:
```typescript
imports: [
  ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: path.join(__dirname, '../../../.env'), // loads root .env in both src/ and dist/
  }),
  BullModule.forRootAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      connection: { url: config.getOrThrow('UPSTASH_REDIS_URL'), tls: {} },
    }),
  }),
  SupabaseModule,
  AuthModule,
  WatchlistModule,
  FinnhubModule,
  GatewayModule,
  AlertsModule,
  HealthModule,
]
```

**`AuthModule`** — uses jose JWKS guard; no PassportModule needed:
```typescript
providers: [SupabaseAuthGuard],
exports:   [SupabaseAuthGuard],
```

**`AlertsModule`** — `AlertsProcessor` must be in `providers[]` for BullMQ to pick it up:
```typescript
imports:   [BullModule.registerQueue({ name: 'alerts' }), GatewayModule],
providers: [AlertsService, AlertsProcessor],
controllers: [AlertsController],
```

### Supabase setup

1. Create new Supabase project
2. Authentication → Providers → enable **GitHub** (add Client ID + Secret from a GitHub OAuth App with callback: `https://<project>.supabase.co/auth/v1/callback`)
3. Authentication → URL Configuration → Site URL = Vercel URL, add `/auth/callback` to Redirect URLs
4. Run SQL schema (below) in SQL editor

```sql
-- ─── watchlist_items ──────────────────────────────────────────
CREATE TABLE watchlist_items (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, symbol)
);
ALTER TABLE watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_items: select own" ON watchlist_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "watchlist_items: insert own" ON watchlist_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watchlist_items: update own" ON watchlist_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watchlist_items: delete own" ON watchlist_items FOR DELETE USING (auth.uid() = user_id);

-- ─── alerts ───────────────────────────────────────────────────
CREATE TABLE alerts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  threshold_price NUMERIC(12,4) NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('above','below')),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts: select own" ON alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alerts: insert own" ON alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts: update own" ON alerts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts: delete own" ON alerts FOR DELETE USING (auth.uid() = user_id);

-- ─── alert_history ────────────────────────────────────────────
CREATE TABLE alert_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id         UUID REFERENCES alerts(id) ON DELETE SET NULL,
  symbol           TEXT NOT NULL,
  triggered_at     TIMESTAMPTZ DEFAULT NOW(),
  price_at_trigger NUMERIC(12,4) NOT NULL,
  message          TEXT
);
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_history: select own" ON alert_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alert_history: insert own" ON alert_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alert_history: update own" ON alert_history FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alert_history: delete own" ON alert_history FOR DELETE USING (auth.uid() = user_id);

-- ─── service_role grants (required for NestJS backend) ────────
-- RLS and GRANT are separate. Tables created via SQL Editor do NOT
-- automatically grant privileges to service_role — must be explicit.
GRANT ALL ON public.watchlist_items TO service_role;
GRANT ALL ON public.alerts TO service_role;
GRANT ALL ON public.alert_history TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

### Environment variables

**`.env`** (repo root — server only, never commit; loaded via `envFilePath`):
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SECRET_KEY=eyJ...            # secret api key = full DB access, server only
FINNHUB_API_KEY=...
UPSTASH_REDIS_URL=rediss://default:...@...upstash.io:6379   # TCP, not REST URL
PORT=3000
CORS_ORIGIN=https://your-app.vercel.app
```

**`apps/web/src/environments/environment.ts`** — generated at build time by `scripts/set-env.ts --dev|--prod` from the root `.env` (gitignored, no `environment.prod.ts` — fileReplacements removed):
```typescript
export const environment = {
  production: true,             // false for --dev
  supabaseUrl: '...',           // from SUPABASE_URL
  supabasePublishableKey: '...',// from SUPABASE_PUBLISHABLE_KEY (Publishable key, browser-safe)
  apiUrl: '...',                // from API_URL
  wsUrl: '...',                 // from WS_URL
};
```

**Vercel environment variables** (Dashboard → Project → Settings → Environment Variables):
```
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
API_URL      = https://pulseticker-api.onrender.com
WS_URL       = https://pulseticker-api.onrender.com
```

---

## Phase 2: Finnhub WebSocket + Watchlist CRUD

### Key implementation: FinnhubService (apps/api/src/finnhub/finnhub.service.ts)

Singleton WS connection to Finnhub. Maintains a `subscriptions: Set<string>`. On `open`, re-subscribes all symbols (handles reconnect). Exponential backoff on `close`. Calls `PricesGateway.broadcastPrice()` on each trade message.

```typescript
// Circular dep pattern: FinnhubService ↔ PricesGateway
// Use forwardRef() on @Inject and on module imports[] in both modules
@Inject(forwardRef(() => PricesGateway)) private gateway: PricesGateway;
```

### Key implementation: PricesGateway (apps/api/src/gateway/prices.gateway.ts)

```typescript
@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN }, namespace: '/prices' })
```

- `handleConnection`: extract `client.handshake.auth.token`, call `supabase.auth.getUser(token)` to validate; join socket to `user:<userId>` room for targeted alert notifications; reject unauthenticated clients
- `handleSubscribe`: for each symbol, `client.join('symbol:' + sym)` + `finnhubService.subscribe(sym)`
- `broadcastPrice(symbol, price, ts)`: `this.server.to('symbol:' + symbol).emit('price', {...})`

Note: `@UseGuards()` doesn't apply to WebSocket `handleConnection` — manual JWT validation is required.

### Angular: SocketService (apps/web/src/app/core/services/socket.service.ts)

```typescript
connect(token: string) {
  this.socket = io(environment.wsUrl + '/prices', {
    auth: { token },
    transports: ['websocket'],
  });
  this.socket.on('price', data => this.price$.next(data));
  this.socket.on('alert-triggered', data => this.alert$.next(data));
}
```

Dashboard flow: `ngOnInit` → load watchlist from REST → connect socket → subscribe to symbols → `price$` observable drives template.

---

## Phase 3: BullMQ Alerts

### BullMQ config

`BullModule.forRootAsync` is already wired in AppModule (Phase 1 corrections).
AlertsModule only needs `BullModule.registerQueue({ name: 'alerts' })`.

Use `@nestjs/bullmq` (not `@nestjs/bull`) — different package for the newer BullMQ library.

### AlertsProcessor (apps/api/src/alerts/alerts.processor.ts)

Uses the modern `WorkerHost` pattern: `extends WorkerHost`, override `process(job)`.
Runs in the same NestJS process (simpler for portfolio):
1. Fetch alert from Supabase, check if still active
2. Evaluate threshold (above/below current price)
3. If triggered: deactivate alert, insert `alert_history`, emit `alert-triggered` to `user:<userId>` Socket.io room

### Connecting price ticks to alert checks

In `FinnhubService` price handler, also call `alertsService.checkAlerts(symbol, price)` which queries active alerts for that symbol and enqueues a BullMQ job for each one.

---

## Phase 4: Polish + Tests + README

- `HealthController` uses `@nestjs/terminus` with 3 indicators: custom Supabase
  ping (`select id from watchlist_items limit 1`), custom Redis ping
  (`queue.getJobCounts()`), and `MemoryHealthIndicator.checkHeap` (200 MB)
- Render keep-alive: Angular root `App` component sets a 14-min `setInterval`
  that `fetch`es `/health` (Render free tier sleeps after 15 min idle)
- Unit test `AlertsProcessor.process()`: mock Supabase + gateway, verify
  threshold logic (4 cases: inactive, above-no-trigger, above-trigger, below-trigger)
- Unit test `PricesGateway` connection handling: verify disconnect on missing/
  invalid JWT, joins `user:<id>` on valid JWT
- README: ASCII architecture diagram, env var list, local setup steps

---

## Local Setup (for README)

### API environment
```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SECRET_KEY, FINNHUB_API_KEY, UPSTASH_REDIS_URL
```

### Angular environment
Fill in the Angular-specific vars in the root `.env` (already copied above):
```
SUPABASE_PUBLISHABLE_KEY=eyJ...   # Supabase Dashboard → Project Settings → API → Publishable key
API_URL=http://localhost:3000
WS_URL=http://localhost:3000
```
`pnpm dev` runs `tsx scripts/set-env.ts --dev` automatically before `ng serve`,
so `environment.ts` is generated from `.env` — no manual copy needed.

### Start dev servers
```bash
pnpm dev   # starts api (port 3000) and web (port 4200) concurrently via Turborepo
```

---

## Deployment Checklist

### Render (NestJS API)
- [ ] Root directory: `apps/api`
- [ ] Build: `pnpm install && pnpm run build`
- [ ] Start: `node dist/main`
- [ ] Set all env vars from `apps/api/.env`
- [ ] Set `NODE_ENV=production`, `CORS_ORIGIN=<vercel-url>`

### Vercel (Angular)
- [ ] Root directory: `apps/web`
- [ ] Framework preset: Angular
- [ ] Build: `tsx scripts/set-env.ts --prod && ng build` (set-env reads Vercel env vars)
- [ ] Output: `dist/web/browser`
- [ ] Add `vercel.json` **before first deploy** (missing this causes 404 on direct URL access):
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- [ ] Supabase Redirect URLs must include `https://<vercel-url>/auth/callback`

### Upstash Redis
- [ ] Create database on Upstash free tier
- [ ] Copy `rediss://` URL to Render env vars (`UPSTASH_REDIS_URL`)

---

## Key Pitfalls

| Pitfall | Solution |
|---|---|
| Circular dep: FinnhubService ↔ PricesGateway | `forwardRef()` on both `@Inject` and module `imports[]` |
| WebSocket guards don't apply to `handleConnection` | Manual `supabase.auth.getUser(token)` in `handleConnection` |
| `@nestjs/bull` vs `@nestjs/bullmq` | Install `@nestjs/bullmq` — different API, matches BullMQ requirement |
| Supabase JWT uses asymmetric ES256 | Use jose `createRemoteJWKSet` + `jwtVerify`; fetch keys from `SUPABASE_URL/auth/v1/.well-known/jwks.json` |
| Angular standalone (no NgModules) | Use `app.config.ts` providers, not `AppModule`. Ignore older Angular tutorials. |
| Angular 22 ships without zone.js | Add `provideZonelessChangeDetection()` in `app.config.ts`; use `signal()` for any state bound to templates |
| Authenticated user clicks "Sign in" again | Add `publicOnlyGuard` to `/` route; redirects to `/dashboard` if `session$.value` is truthy |
| Upstash Redis requires TLS | Pass `tls: {}` in BullMQ connection config |
| Finnhub WS drops during Render cold start | Reconnect logic in `FinnhubService` re-subscribes all symbols on `open` |
| Alert notifications must be per-user | Join socket to `user:<userId>` room on connect; emit to that room, not broadcast |
| `service_role` gets 42501 on SQL-Editor tables | Run `GRANT ALL ON public.<table> TO service_role` — RLS bypass ≠ table privilege |
| `authGuard` redirects on page reload | `session$` starts as `null`; guard must wait for `initialized$` before evaluating |

---

## Data Flow Summary (for README / interviews)

```
Angular → GET /watchlist (REST, JWT in header)
       → socket connect with token
       → emit 'subscribe' {symbols: ['AAPL',...]}
NestJS → FinnhubService.subscribe('AAPL')
       → Finnhub WS: {"type":"subscribe","symbol":"AAPL"}
Finnhub → {"type":"trade","data":[{"s":"AAPL","p":212.34}]}
NestJS → gateway.broadcastPrice('AAPL', 212.34)
       → socket room 'symbol:AAPL' → emit 'price'
Angular → price$ observable → template re-renders

Also on price tick:
NestJS → AlertsService.checkAlerts('AAPL', 212.34)
       → BullMQ enqueue 'check-alert' jobs
       → AlertsProcessor: threshold crossed?
       → Supabase insert alert_history
       → socket room 'user:<id>' → emit 'alert-triggered'
Angular → alert$ → NotificationToastComponent renders
```

---

## Verification

1. **Phase 1**: OAuth login works in production — GitHub login redirects to `/auth/callback`, session is established, `/dashboard` loads (empty state OK)
2. **Phase 2**: Add `AAPL` to watchlist → price updates appear in real-time (verify during US market hours EST 9:30–16:00)
3. **Phase 3**: Create alert for `AAPL` above/below current price ±$1 → within seconds, toast notification fires + history row appears in Supabase
4. **Phase 4**: `curl https://<render-url>/health` returns rich JSON: `{ "status": "ok", "info": { "supabase": {...}, "redis": {...}, "memory_heap": {...} }, ... }`. Jest test suite passes with `pnpm --filter api test` (8 tests)
