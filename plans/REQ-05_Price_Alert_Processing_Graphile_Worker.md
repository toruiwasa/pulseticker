## REQ-05 (Final): Price Alert Processing — Graphile Worker

**Use Case**

Users set price threshold alerts on watched symbols. When a price condition is met, the alert is processed asynchronously, persisted to history, and delivered as a real-time in-app notification. Processing is decoupled from the WebSocket price stream to avoid blocking real-time delivery.

**Scope**

Single-instance deployment. Scalability (multi-instance cache sync) is out of scope for this project.

**Design Decision: Why Graphile Worker over BullMQ**

BullMQ requires Redis as an external dependency. Upstash Redis free tier (500k commands/month) was exhausted in development due to per-tick job submission. Graphile Worker uses the existing Supabase PostgreSQL instance — no additional service required.

**Job Delivery: LISTEN/NOTIFY (Push-based)**

Graphile Worker uses PostgreSQL LISTEN/NOTIFY by default. Jobs are delivered to the worker instantly when inserted — no polling delay. `pollInterval` is retained only as a fallback for when the LISTEN/NOTIFY connection is interrupted.

```
addAlertCheckJob()
    ↓
PostgreSQL NOTIFY 'jobs:check-price-alert'
    ↓ immediately (no poll wait)
Graphile Worker LISTEN → Worker executes
    ↓
alerts UPDATE (is_active = false) + alert_history INSERT
    ↓
EventEmitter.emit('alert.triggered')
    ↓
PriceGateway → Angular WebSocket → Taiga UI Toast
```

**Pre-check Pattern (Critical)**

Job submission only occurs after an in-memory pre-check confirms a condition is met. Price ticks that trigger no alert produce no jobs and no DB access.

```
tick received (AAPL: $201)
    ↓
AlertsService.checkAlerts(symbol, price)  ← in-memory, no DB access
    ↓ no matches → return (no job created, no DB access)
    ↓ matches found
QueueService.addAlertCheckJob(payload)    ← job created only on match
    ↓
PostgreSQL NOTIFY (push-based, instant)
    ↓
Graphile Worker executes
```

**Alert Cache**

Active alerts are loaded into memory on startup. The cache lives inside `AlertsService` as a private `Map<string, CachedAlert[]>` (keyed by uppercase symbol). Tick evaluation is entirely in-memory with zero DB access.

```typescript
// In-memory structure
Map<symbol, CachedAlert[]>  // inside AlertsService

// Cache update triggers
- NestJS OnModuleInit      ← full DB load (all is_active=true alerts)
- POST /alerts             ← new CachedAlert pushed directly into Map (no DB reload)
- DELETE /alerts/:id       ← alert removed from Map by alertId (no DB reload)
- alert fired (worker)     ← @OnEvent('alert.triggered') removes alertId from Map
```

Note: In-memory cache is not shared across instances. This is acceptable for single-instance deployment.

**Job Definition**

```
job name:     'check-price-alert'
payload:      { alertId, symbol, price, userId }
jobKey:       `alert-${alertId}`
jobKeyMode:   'replace'
pollInterval: 1000ms  (fallback only — normal delivery is push-based via LISTEN/NOTIFY)
noHandleSignals: true
```

**Worker Responsibilities**

```
1. UPDATE alerts SET is_active = false WHERE id = alertId
2. INSERT into alert_history (alert_id, user_id, price_at_trigger, message)
3. EventEmitter.emit('alert.triggered', { alertId, userId, symbol, price, ... })
   → @OnEvent('alert.triggered') in AlertsService removes alertId from cache Map
```

**WebSocket Notification Bridge**

Graphile Worker runs as a managed process inside NestJS and cannot access injected services directly. NestJS EventEmitter is used as a bridge:

```
check-price-alert task
    ↓ EventEmitter.emit('alert.triggered')
PricesGateway @OnEvent('alert.triggered')
    ↓ this.server.to(userId).emit('alert-triggered', payload)
Angular
    ↓ Taiga UI Toast
```

**Infrastructure**

No additional service required. Graphile Worker schema (`graphile_worker.*`) is created automatically on first run within the existing Supabase PostgreSQL instance.

**NestJS Module Structure**

```
queue/
├── queue.module.ts
├── queue.service.ts         ← addAlertCheckJob()
├── worker-runner.service.ts ← run() on OnModuleInit
└── tasks/
    └── check-price-alert.ts ← makeCheckPriceAlertTask() factory
```

**Removed Dependencies**

```
- bullmq
- @nestjs/bullmq
- ioredis
- Upstash Redis
```

**Decisions Log**

| Topic | Decision | Rationale |
|---|---|---|
| Task file path | `queue/tasks/check-price-alert.ts` (not `workers/`) | `tasks/` is the conventional Graphile Worker directory name |
| Alert cache location | Cache lives in `AlertsService`, not a separate `AlertCacheService` | No behaviour difference; avoids unnecessary indirection for a single-instance app |
| Cache mutation strategy | `createAlert`/`deleteAlert` mutate Map in-place; no per-user DB reload | Avoids an extra DB round-trip on every CRUD operation |
| Worker step order | `UPDATE alerts` before `INSERT alert_history` | Deactivating first prevents a second tick re-triggering the alert before the history row is written |
| alert_history column | `price_at_trigger` (not `triggered_price`) | Matches the actual DB column defined in the init migration |
| Socket.io event name | `alert-triggered` (not `alert`) | Kept consistent with the original BullMQ-era gateway implementation; avoids a frontend breaking change |

---

# REQ-05 Implementation Plan: Graphile Worker Migration

This plan outlines the steps to migrate the price alert processing system from BullMQ to Graphile Worker, removing the Redis dependency and implementing an in-memory pre-check pattern.

## User Review Required

> [!IMPORTANT]
> **Environment Variable Addition**
> Graphile Worker requires a direct PostgreSQL connection string to leverage `LISTEN/NOTIFY`. The existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are for the REST API.
> You will need to add a `DATABASE_URL` (e.g., `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`) to your `.env` file. Do you have access to your Supabase Postgres connection string?

## Open Questions

None at this time. The revised REQ-05 provides all the necessary architectural details.

## Proposed Changes

---

### Dependencies

#### [MODIFY] apps/api/package.json

- Remove `bullmq` and `@nestjs/bullmq`
- Install `graphile-worker` and `@nestjs/event-emitter`

---

### Configuration

#### [MODIFY] .env.example

- Remove `UPSTASH_REDIS_URL`
- Add `DATABASE_URL` (Direct PostgreSQL connection string)
- Note: This will need to be configured in your local `.env` and production environments.

#### [MODIFY] apps/api/src/app.module.ts

- Remove `BullModule` initialization.
- Import and configure `EventEmitterModule.forRoot()`.
- Add the new `QueueModule`.

#### [MODIFY] apps/api/src/health/health.module.ts & [DELETE] apps/api/src/health/redis.health.ts

- Remove `redis.health.ts` as we no longer connect to Redis.
- Remove `BullModule` from `HealthModule`.

---

### Queue & Graphile Worker

#### [NEW] apps/api/src/queue/queue.module.ts

- Exports the `QueueService` and `WorkerRunnerService`.

#### [NEW] apps/api/src/queue/queue.service.ts

- Initializes Graphile Worker `makeWorkerUtils` using `DATABASE_URL`.
- Provides `addAlertCheckJob(payload)` to insert a job using `workerUtils.addJob('check-price-alert', payload, { jobKey, jobKeyMode: 'replace' })`.

#### [NEW] apps/api/src/queue/worker-runner.service.ts

- Implements `OnModuleInit` and `OnModuleDestroy`.
- Starts the Graphile worker runner via `run({ connectionString, taskDirectory, pollInterval: 1000 })` on startup.
- Gracefully shuts down the runner on destroy.

#### [NEW] apps/api/src/queue/tasks/check-price-alert.ts

- The Graphile Worker task definition (replacing `AlertsProcessor`).
- Verifies the alert condition again (for safety).
- Inserts into `alert_history` and updates `alerts.is_active = false`.
- Uses `EventEmitter2` to emit the `alert.triggered` event to be picked up by the WebSocket Gateway.

---

### Alert Cache & Pre-check

#### [MODIFY] apps/api/src/alerts/alerts/alerts.service.ts

- Implement the **Alert Cache**.
- Add `OnModuleInit` to fetch all `is_active = true` alerts from the database and populate an in-memory `Map<string, Alert[]>`.
- Update `createAlert` and `deleteAlert` to also update the in-memory cache.
- Add an `@OnEvent('alert.triggered')` listener to remove the fired alert from the in-memory cache.
- Modify `checkAlerts` to evaluate the price tick purely against the in-memory Map (zero DB access). If a match is found, call `QueueService.addAlertCheckJob`.

#### [DELETE] apps/api/src/alerts/alerts.processor.ts

- Removed in favor of the new Graphile Worker task.

---

### WebSocket Notification Bridge

#### [MODIFY] apps/api/src/gateway/prices.gateway.ts

- Implement an `@OnEvent('alert.triggered')` event listener.
- When the event is caught from the Graphile Worker task, use `this.server.to(userId).emit('alert', payload)` to push the real-time notification to the frontend.

## Verification Plan

### Automated Tests

- `npm run test` will be executed.
- Existing test suites for `alerts.service.spec.ts` and `alerts.processor.spec.ts` (if applicable) will need to be updated or removed to align with the new module structure and dependencies.

### Manual Verification

- Start the API server.
- Ensure the Graphile Worker schema is automatically created in Supabase.
- Add an alert via the UI.
- Verify that a Finnhub price tick matching the alert correctly triggers a job without Redis.
- Confirm the toast notification appears in the UI instantly.
- Check Supabase `alert_history` to ensure the record was created.
