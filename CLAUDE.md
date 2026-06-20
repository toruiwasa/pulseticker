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

## Planning Workflow

See [SDLC.md](./SDLC.md) for the full development lifecycle — phases, skill assignments, exit criteria, and fast paths.

Before invoking any skill:

1. **Discuss first** — Ask clarifying questions in conversation. Surface ambiguities, trade-offs, and better alternatives before any exploration.
2. **Read the codebase** — Understand the relevant existing implementation before proposing anything. Point out what already exists and how the new feature fits.
3. **Agree on the spec** — Reach consensus in conversation. The plan file is written once, at the end, as a record of what was already agreed.

The plan file is a **record of agreed decisions**, not a draft to iterate on.

## Git Workflow

- **Branch per task**: Always create a new branch before starting any task (`git checkout -b <short-descriptor>`).
- Commit on the branch; merge into `main` when the task is complete.
- Branch names should be short and descriptive (e.g. `feat/symbol-search`, `fix/alert-oanda-display`).

## Key Principles

- Deploy-first: Phase 1 must be live before adding features
- No mock data — real Finnhub prices only
- NestJS + Angular are intentional learning targets (developer has 6yr TS/Node/React experience but is new to both frameworks)
- Commit once per completed feature (not per file)
- **Library-first UI**: Always prefer existing library components (Taiga UI, Angular CDK) over custom HTML + CSS implementations. Writing custom UI or logic without justification is NG. Taiga UI components are customizable via CSS custom properties (`--tui-*`) — override tokens in `styles.css` rather than reimplementing from scratch.

## Testing

- **Boundary-first**: Always test application boundaries — HTTP controllers, WebSocket gateways, pipes. Internal service logic is tested only where needed to reach the coverage target.
- **Coverage target**: 90–95% per changed file. Verify with `pnpm --filter api test:cov` / `pnpm --filter web test:cov`.
- **No Angular TestBed for pure logic**: Pipes and utility functions are instantiated directly in Jest.
- **Mock external I/O**: Supabase client, `fetch`, and Socket.io are always mocked — never hit real services in unit tests.
- **Coverage package version pinning**: When installing `@vitest/coverage-v8` or `@vitest/coverage-istanbul`, pin to the exact same version as `vitest` already in the project (`pnpm add -D @vitest/coverage-v8@$(node -p "require('./node_modules/vitest/package.json').version") --filter web`). A version mismatch creates two vitest instances and silently breaks `vi.mock()` intercepts.

## Validation

- **Zod for all schemas**: All request/response validation schemas live in shared packages (`packages/`) using Zod. Import and reuse them in both `apps/api/` and `apps/web/`.
- **Schema-first types**: TypeScript types are inferred from Zod schemas (`z.infer<typeof Schema>`). Never define a separate interface or type for the same shape.
- **No class-validator / class-transformer DTOs**: Do not use decorator-based DTO classes. Never add `@IsString()`, `@IsNumber()`, etc.
- **No global ValidationPipe**: NestJS controllers call `Schema.parse(body)` directly and throw `BadRequestException` on `ZodError`. `main.ts` stays unchanged.

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

## Logging Strategy

### 基本ツール

| 層 | ツール | 場所 |
|---|---|---|
| Frontend (Angular) | `LoggerService` | `apps/web/src/app/core/services/logger.service.ts` |
| Backend (NestJS) | `SecureLogger` | `apps/api/src/common/logger/secure-logger.ts` |
| 共通コア | `sanitize()`, `REDACTED_KEYS`, `LogLevel` | `packages/logging/src/index.ts` |

`console.log` / `console.error` を直接呼ぶことは禁止。必ず上記ツールを経由すること。

---

### セキュリティ要件

#### 絶対禁止事項（Frontend・Backend 共通）

以下は **いかなる状況でも、いかなるログレベルでも** 出力してはならない:

| 種別 | 具体例 | 理由 |
|---|---|---|
| 認証トークン | `access_token`, `refresh_token`, `id_token`, JWT 全体 | 漏洩でアカウント乗っ取り直結 |
| 認証情報 | `password`, `client_secret`, Supabase `service_role` キー | 同上 |
| API キー | `FINNHUB_API_KEY`, `TWELVEDATA_API_KEY`, `SUPABASE_ANON_KEY` | 不正利用・課金被害 |
| `Authorization` ヘッダ値 | `req.headers.authorization` の中身 | Bearer トークンが含まれる |

#### フロントエンド追加禁止事項

ブラウザコンソールは **エンドユーザーを含む誰もが DevTools で閲覧可能**。
サーバーサイドより厳格なポリシーを適用する:

| 種別 | 具体例 | 法的根拠 |
|---|---|---|
| PII | `email`, `phone`, `name`, `address` | Australian Privacy Act 1988 APP 3, APP 11 |
| ユーザー識別子 | `userId` / UUID（ブラウザログでは不要） | APP 3: 必要最小限の収集 |
| Raw オブジェクト | `session`, `user`, `Error` オブジェクト丸ごと | トークン・PII が混入している可能性 |
| エラーメッセージ全文 | `error.message` | Supabase/jose エラー本文にトークン断片が含まれうる |

**ログに出してよいもの（Frontend）:**
- 状態フラグ: `{ hasSession: true }`, `{ hasCode: true }`
- イベント名: `'SIGNED_IN'`, `'SIGNED_OUT'`
- エラー種別名: `error.name`（例: `'AuthApiError'`）
- ナビゲーション先: `'/dashboard'`, `'/'`

#### バックエンド追加ガイドライン

Render インフラのアクセス制御で保護されているが、それでも慎重に:

| 種別 | 方針 |
|---|---|
| `userId` (UUID) | ✅ 監査証跡・トレーシングに許可 |
| Supabase `error.code` | ✅ Postgres エラーコード（例: `"23505"`）は安全 |
| HTTP ステータスコード | ✅ 安全 |
| エラースタックトレース | ✅ DEBUG レベルのみ。prod は `LOG_LEVEL=warn` で抑制 |
| `email` | ⚠️ セキュリティ監査（不正ログイン検知・アカウントロック）に限定。通常デバッグに使わない |
| IP アドレス | ⚠️ 不正アクセス検知・レート制限のみ (APP 3: 必要最小限) |
| `error.message`（外部サービス由来） | ⚠️ 内容を確認してから。Supabase/jose のメッセージはトークン断片を含みうる |

---

### 実装ルール

#### 1. データ型制約による防御

`LoggerService` / `SecureLogger` のデータ引数は `Record<string, unknown>` に限定する。
`Session`, `User`, `Error` 型を直接渡せない設計にすることで、
呼び出し元の誤りを TypeScript コンパイル時に検出できるようにする。

```typescript
// NG: Session オブジェクト丸ごと（access_token が含まれる）
logger.debug('AUTH', 'session', session);

// OK: 必要なフラグだけ取り出して渡す
logger.debug('AUTH', 'event: SIGNED_IN', { hasSession: !!session });
```

#### 2. sanitize() による多層防御

`@pulseticker/logging` の `sanitize()` は、呼び出し元が誤って
`REDACTED_KEYS` に含まれるキー（`access_token` 等）を持つオブジェクトを渡した場合でも
`[REDACTED]` に置換する。**これは最後の砦であり、呼び出し元での制御が第一義。**

#### 3. エラーハンドリング — 無音失敗の禁止

`catch` ブロックでは必ずログを出力してから処理を続けること。
特にモジュール初期化（`onModuleInit`）や起動時キャッシュロードの失敗は、
無音で続行すると本番で気づかないまま機能が停止する:

```typescript
// NG: 失敗を飲み込む
try {
  await this.workerUtils.initialize();
} catch { }

// OK: ログ → 再スロー（呼び出し元に伝播させる）
try {
  await this.workerUtils.initialize();
} catch (err) {
  this.logger.error('Failed to initialize', (err as Error).stack);
  throw err;
}
```

#### 4. ログレベルの使い分け

| レベル | 使う場面 |
|---|---|
| `debug` | 開発時のフロー追跡（prod では出力されない） |
| `info` / `log` | 正常な業務イベント（接続確立、処理完了） |
| `warn` | 異常だが続行可能（認証失敗、API エラーでフォールバック） |
| `error` | 例外・致命的エラー（再スローする前に必ず記録） |

#### 5. 環境とログレベル — `APP_ENV` で管理

`APP_ENV` 環境変数（`.env`）でアプリ全体の環境を一元管理。Frontend は `scripts/set-env.ts` で
`environment.ts` に反映、Backend は `process.env.APP_ENV` を直接参照する。

| `APP_ENV` | Frontend `logLevel` | Backend エラー詳細 | 用途 |
|---|---|---|---|
| `development` | `debug` | `error.message` + `error.stack` を出力 | ローカル開発 |
| `staging` | `info` | `error.name` のみ | ステージング |
| `production` | `warn` | `error.name` のみ | 本番 |
| (未定義) | `warn` | `error.name` のみ | 安全側フォールバック |

#### 6. 機密情報を含みうるエラーは `errorWithCause()` / `warnWithCause()` を使う

Supabase 認証、jose JWT 検証など、`error.message` にトークン断片が混入する可能性がある
ソースでは、専用メソッドを使用する。`APP_ENV=development` のときのみ詳細が出力される:

```typescript
// NG (デバッグ不能): err.message を一切出さない
this.logger.warnData('JWT failed', { errorName: err.name });

// OK (env-gated): dev では errorMessage + stack、prod では errorName のみ
this.logger.warnWithCause('JWT failed', err);
```

外部プロトコルレベルのエラー（HTTP ステータス、WS 切断理由）など、
内容に機密情報が含まれないと判明しているものは、引き続き `err.message` を直接渡してよい
（例: `FinnhubService.logger.error('WS error', err.message)`）。

---

### 参照規格

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- Australian Privacy Act 1988 — Australian Privacy Principles (APP):
  - APP 3: 個人情報の収集は目的に必要な範囲に限定
  - APP 11: 個人情報の漏洩・誤用・不正アクセスから保護する合理的な措置を講じること
