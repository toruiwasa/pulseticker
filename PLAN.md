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
    ├── api/                  ← NestJS → Render
    │   └── src/
    │       ├── main.ts
    │       ├── app.module.ts
    │       ├── supabase/     ← shared DB client (@Global module)
    │       ├── auth/         ← JwtStrategy + JwtAuthGuard
    │       ├── watchlist/    ← CRUD controller + service
    │       ├── finnhub/      ← Finnhub WS client (singleton)
    │       ├── gateway/      ← Socket.io PricesGateway
    │       ├── alerts/       ← controller + service + BullMQ processor
    │       └── health/       ← GET /health for Render keep-alive
    └── web/                  ← Angular standalone → Vercel
        └── src/app/
            ├── core/
            │   ├── guards/auth.guard.ts
            │   ├── services/auth.service.ts
            │   ├── services/socket.service.ts
            │   ├── services/api.service.ts
            │   └── interceptors/auth.interceptor.ts
            └── features/
                ├── auth/callback/
                ├── dashboard/ (watchlist + price-ticker)
                └── alerts/ (create form + history)
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
  class-validator class-transformer @nestjs/config \
  passport @nestjs/passport passport-jwt
pnpm add -D @types/ws @types/passport-jwt @types/jest jest ts-jest supertest @types/supertest

# Angular frontend
cd /Users/wasashi/pulseticker/apps
pnpm add -g @angular/cli
ng new web --routing --style css --standalone --skip-git --package-manager pnpm
cd web
pnpm add @supabase/supabase-js socket.io-client
```

**`pnpm-workspace.yaml`** (root):
```yaml
packages:
  - 'apps/*'
```

**Root `package.json`** (scripts use `pnpm --filter` instead of `--workspace`):
```json
{
  "name": "pulseticker",
  "private": true,
  "scripts": {
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
# Create auth/supabase.strategy.ts manually (needs PassportStrategy)
```

### NestJS module wiring (required — not generated by CLI)

**`AppModule`** — `ConfigModule` must be first in `imports[]`:
```typescript
imports: [
  ConfigModule.forRoot({ isGlobal: true }),  // must be first; isGlobal exposes ConfigService everywhere
  SupabaseModule,
  AuthModule,
  WatchlistModule,
  FinnhubModule,
  GatewayModule,
  AlertsModule,
  HealthModule,
  BullModule.forRoot({ connection: { url: process.env.UPSTASH_REDIS_URL, tls: {} } }),
  BullModule.registerQueue({ name: 'alerts' }),
]
```

**`AuthModule`** — must register `PassportModule` and `SupabaseJwtStrategy` as providers:
```typescript
imports:   [PassportModule.register({ defaultStrategy: 'supabase' })],
providers: [SupabaseJwtStrategy, JwtAuthGuard],
exports:   [JwtAuthGuard],
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
```

### Environment variables

**`apps/api/.env`** (server only — never commit):
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # service role = full DB access, server only
SUPABASE_JWT_SECRET=...               # Supabase Dashboard → Settings → API → JWT Secret
FINNHUB_API_KEY=...
UPSTASH_REDIS_URL=rediss://default:...@...upstash.io:6379
PORT=3000
CORS_ORIGIN=https://your-app.vercel.app
```

**`apps/web/src/environments/environment.prod.ts`** (build-time, safe to expose):
```typescript
export const environment = {
  production: true,
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseAnonKey: 'eyJ...',            // anon key = public, client-safe
  apiUrl: 'https://pulseticker-api.onrender.com',
  wsUrl: 'https://pulseticker-api.onrender.com',
};
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

### BullMQ config in AppModule

```typescript
BullModule.forRoot({
  connection: { url: process.env.UPSTASH_REDIS_URL, tls: {} }, // Upstash requires TLS
}),
BullModule.registerQueue({ name: 'alerts' }),
```

Use `@nestjs/bullmq` (not `@nestjs/bull`) — different package for the newer BullMQ library.

### AlertsProcessor (apps/api/src/alerts/alerts.processor.ts)

Runs in the same NestJS process (simpler for portfolio):
1. Fetch alert from Supabase, check if still active
2. Evaluate threshold (above/below current price)
3. If triggered: deactivate alert, insert `alert_history`, emit `alert-triggered` to `user:<userId>` Socket.io room

### Connecting price ticks to alert checks

In `FinnhubService.broadcastPrice()`, also call `alertsService.checkAlerts(symbol, price)` which queries active alerts for that symbol and enqueues a BullMQ job for each one.

### Keep-alive ping (Render cold start)

```typescript
// Angular app.component.ts
setInterval(() => fetch(`${environment.apiUrl}/health`), 14 * 60 * 1000);
```

---

## Phase 4: Polish + Tests + README

- `HealthController`: use `@nestjs/terminus` — check Supabase connectivity
- Unit test `AlertsProcessor.handleCheckAlert()`: mock Supabase + gateway, verify threshold logic
- Unit test `PricesGateway` connection handling: verify disconnect on invalid JWT
- README: ASCII architecture diagram, env var list, local setup steps

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
- [ ] Build: `ng build --configuration production`
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
| Angular standalone (no NgModules) | Use `app.config.ts` providers, not `AppModule`. Ignore older Angular tutorials. |
| Upstash Redis requires TLS | Pass `tls: {}` in BullMQ connection config |
| Finnhub WS drops during Render cold start | Reconnect logic in `FinnhubService` re-subscribes all symbols on `open` |
| Alert notifications must be per-user | Join socket to `user:<userId>` room on connect; emit to that room, not broadcast |

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
4. **Phase 4**: `curl https://<render-url>/health` returns `{"status":"ok"}`. Jest test suite passes with `pnpm --filter api test`
