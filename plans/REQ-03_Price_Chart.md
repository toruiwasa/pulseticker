## REQ-03 : Price Chart — lightweight-charts

**Use Case**

When a user clicks a symbol in their watchlist, a price chart is displayed showing real-time price movement for today's session. The chart updates live as ticks arrive via WebSocket. On the login page, a fixed AAPL chart is displayed in the upper-right area (desktop) or below the ticker list (narrow screens) — no additional API cost.

---

**Library Selection**

lightweight-charts by TradingView.

- Production-grade, purpose-built for financial time-series
- MIT License — no usage restrictions
- Canvas-based, framework-agnostic
- Built-in `autoSize` (v4+) — eliminates `clientWidth = 0` risk

---

**Chart Type**

Line chart (must-have). Candlestick (nice-to-have, post-MVP).

---

**Scope: Two Contexts**

| Context                      | Symbol        | Data source          | Update interval                |
| ---------------------------- | ------------- | -------------------- | ------------------------------ |
| Dashboard (authenticated)    | User-selected | Finnhub WebSocket    | Real-time per tick             |
| Login page (unauthenticated) | AAPL (fixed)  | PreviewService cache | 10 seconds (no extra API call) |

---

**Data Sources — Dashboard**

**Historical data (on symbol select):**

```
GET /chart/candles?symbol=AAPL
```

`from` and `to` are calculated server-side by NestJS. The client passes only `symbol`. NestJS resolves today's market open time (09:30 EST) and current time, accounting for timezone — keeping all time logic server-side.

```typescript
// NestJS: chart.service.ts
const now = Math.floor(Date.now() / 1000);
const marketOpen = getLastTradingDayOpenUnix(); // 09:30 EST of last trading day
const candles = await finnhub.getCandles(symbol, '1', marketOpen, now);
return candles.t
  ? candles.t.map((time, i) => ({ time, value: candles.c[i] }))
  : [];
```

**`getLastTradingDayOpenUnix()` — implementation note:**

Always returns 09:30 EST of the most recent trading day. On weekends and market holidays, it walks back to the previous business day. This ensures the chart and `basePrice` are meaningful even when the user opens the app outside trading hours.

```typescript
// NestJS: utils/trading-day.util.ts  (shared utility — reusable across features)
import { DateTime } from 'luxon'; // or date-fns-tz if already in project

export function getLastTradingDayOpenUnix(): number {
  let candidate = DateTime.now().setZone('America/New_York').startOf('day');

  // Walk back until we land on a trading day (not weekend, not holiday)
  while (isWeekendOrHoliday(candidate)) {
    candidate = candidate.minus({ days: 1 });
  }

  return candidate.set({ hour: 9, minute: 30, second: 0 }).toUnixInteger();
}
```

> **Note:** Verify whether `luxon` or `date-fns-tz` is already present in the API package before adding a new dependency. This utility is a shared candidate for REQ-05 (Price Alert Processing) and any other feature requiring trading-day awareness.

If `/stock/candle` is unavailable on the free tier, the endpoint returns `[]`. The chart initialises from the first WebSocket tick and builds forward. No frontend branching logic required.

**Real-time updates:**

```typescript
// Use Finnhub server-side timestamp (tick.t), NOT Date.now()
// Prevents duplicate-time errors when two ticks arrive within the same second
series.update({ time: tick.t, value: tick.p });
```

**Time axis scope:** Today's session only (09:30 EST → current time).

---

**Data Sources — Login Page**

No additional API calls. PreviewService (REQ-13) fetches AAPL every 10 seconds. PreviewService includes a `timestamp` field to avoid `Date.now()` in the component:

```typescript
// PreviewService cache shape
interface PreviewPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number; // unix seconds — set server-side at fetch time
}
```

```typescript
// Angular login component
export class LoginChartComponent implements OnInit, OnDestroy {
  private series: ISeriesApi<'Line'> | null = null;
  private lastTime: number | null = null; // duplicate-timestamp guard

  onPreviewUpdate(prices: PreviewPrice[]) {
    const aapl = prices.find(p => p.symbol === 'AAPL');
    if (!aapl || !this.series) return;

    // Skip if timestamp is the same or older (e.g. component re-mount)
    if (this.lastTime !== null && aapl.timestamp <= this.lastTime) return;

    this.lastTime = aapl.timestamp;
    this.series.update({ time: aapl.timestamp, value: aapl.price });
  }

  ngOnDestroy() {
    this.lastTime = null; // reset on teardown
    this.series = null;
  }
}
```

Chart builds progressively from page load. No history loaded — starts empty and grows as ticks accumulate.

---

**basePrice Definition**

`basePrice` is set from `candles[0]` (09:30 EST opening price for today's session). If no history is available, it is set from the first WebSocket tick received.

This means line colour reflects change since today's market open — not since the user opened the page.

```typescript
setHistory(candles: { time: number; value: number }[]) {
  this.series?.setData(candles);
  if (candles.length > 0) {
    this.basePrice = candles[0].value;  // today's 09:30 open
  }
}
```

---

**Angular Component**

```typescript
@Component({ ... })
export class PriceChartComponent implements OnInit, OnDestroy {
  private chart: IChartApi;
  private series: ISeriesApi<'Line'> | null = null;  // null-safe declaration
  private tickSubscription: Subscription;
  private basePrice: number | null = null;

  ngOnInit() {
    this.chart = createChart(this.el.nativeElement, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
    });
    this.series = this.chart.addLineSeries({ color: '#22c55e' });
  }

  setHistory(candles: { time: number; value: number }[]) {
    this.series?.setData(candles);
    if (candles.length > 0) this.basePrice = candles[0].value;
  }

  onTick(tick: { t: number; p: number }) {
    if (!this.series) return;  // guard against stale ticks after symbol switch
    if (this.basePrice === null) this.basePrice = tick.p;
    const color = tick.p >= this.basePrice ? '#22c55e' : '#ef4444';
    this.series.applyOptions({ color });
    this.series.update({ time: tick.t, value: tick.p });
  }

  ngOnDestroy() {
    this.tickSubscription?.unsubscribe();
    this.chart?.remove();
    this.series = null;
  }
}
```

---

**Chart Sizing**

`autoSize: true` handles width automatically. Height is set with explicit `px` values — `height: 100%` is avoided because it collapses to `0` when the parent has no explicit height.

```css
.chart-container {
  width: 100%;
  max-width: 900px;
  height: 400px; /* explicit px — no parent height dependency */
}
```

Login page chart container uses tighter constraints:

```css
/* login page — right column */
.login-chart-container {
  width: 100%;
  max-width: 600px;
  height: 280px;
}
```

---

**Responsive Layout**

**Desktop (≥ 768px):** Ticker list left, chart right — side by side.

**Narrow / Mobile (< 768px):** Chart moves below ticker list, stacked vertically.

```css
.login-top {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 1px;
}

@media (max-width: 768px) {
  .login-top {
    grid-template-columns: 1fr; /* stacks vertically */
  }

  .login-chart-container {
    height: 200px; /* reduced height on mobile — explicit px */
  }
}
```

**Mobile chart behaviour:**

- `autoSize: true` handles width automatically
- Height is reduced via container `max-height`
- Font sizes inside the chart (`textColor`, axis labels) remain readable — lightweight-charts handles DPI scaling natively

---

**Singleton Behaviour (Dashboard)**

One chart displayed at a time. Symbol switching must unsubscribe the previous tick stream before subscribing to the new one:

```
User clicks AAPL → AAPL chart opens
User clicks MSFT → AAPL unsubscribed + unmounted → MSFT chart opens
```

---

**Theming**

- Background: transparent (inherits Taiga UI dark theme)
- Line colour reflects change since today's market open (basePrice = candles[0])
  - `price >= basePrice` → green `#22c55e`
  - `price < basePrice` → red `#ef4444`
- `series.applyOptions({ color })` called on each tick

---

**NestJS Proxy Endpoint**

```
GET /chart/candles?symbol=AAPL
→ symbol only — from/to calculated server-side (09:30 EST → now)
→ returns { time, value }[] (value = closing price c[i]) or [] on error
→ Finnhub API key never exposed to client
→ timezone logic centralised on server
```

---

**Error / Loading States**

| State                              | UI                                                |
| ---------------------------------- | ------------------------------------------------- |
| Loading historical data            | Skeleton placeholder                              |
| Historical data unavailable (`[]`) | Chart starts from first WebSocket tick            |
| No ticks received yet              | Empty chart with axes only                        |
| Symbol switched                    | Previous chart unmounted, WebSocket unsubscribed  |
| Login page — Finnhub unavailable   | `---` per REQ-13 error state, chart shows no data |

---

**Historical Data Source — Open Issue**

> Surfaced from the integration build. Blocks the "long-term chart" feature requested by the user.

### Problem

When a user clicks a watchlist row on the dashboard, the chart appears empty and only starts to draw a line from the moment of the click. Visually it looks like a "since-click" chart, not a long-term historical view.

The root cause:

- `ChartService.getCandles` (`apps/api/src/chart/chart.service.ts:16-28`) delegates to `FinnhubService.getCandles` (`apps/api/src/finnhub/finnhub/finnhub.service.ts:79`), which calls `https://finnhub.io/api/v1/stock/candle`.
- That endpoint is **no longer available on the Finnhub free plan for US stocks** (since 2024). The response is `{ s: 'no_data' }`, so `ChartService.getCandles` returns `[]`.
- The frontend (`apps/web/src/app/features/dashboard/price-chart/price-chart.component.ts:136-143`) receives an empty history and the chart populates only from incoming WebSocket ticks.

Live ticks via the `/prices` Socket.io namespace **continue to work** — only the historical pre-fill is broken.

### Data-source options

| # | Source | API key | Free-tier limits | US stocks | Forex (OANDA) | Notes |
|---|---|---|---|---|---|---|
| 1 | Finnhub `/stock/candle` (current) | already have | n/a | ❌ Paid only | ⚠ Limited | Cause of the bug |
| 2 | **Yahoo Finance** (`query1.finance.yahoo.com/v8/finance/chart`) | None | Generous, no formal cap | ✅ | ✅ (`AUDUSD=X`) | Unofficial but widely used; suitable for portfolio demo |
| 3 | **Alpha Vantage** | Required (`ALPHA_VANTAGE_API_KEY`) | 25 req / day | ✅ | ✅ | Tight free quota — needs server-side caching |
| 4 | **Twelve Data** | Required (`TWELVEDATA_API_KEY`) | 800 req / day | ✅ | ✅ | Comfortable quota, official |
| 5 | **Polygon.io** | Required | Restrictive on free tier | ✅ | △ | Less attractive for demo |

**Decision for the portfolio MVP:** Twelve Data — 800 req/day free limit is ample for portfolio/demo use, official API, stable, and supports both US stocks and Forex out of the box. Requires registering for a free API key (`TWELVEDATA_API_KEY`).

### Extensible API surface

Whatever source we pick, the API should expose an explicit `range` query parameter so we can ship `1Y` first and grow into other ranges without breaking the contract:

```text
GET /chart/candles?symbol=AAPL&range=1Y
```

- `range` is **optional**, defaults to `1D`.
- Initial supported values: `1D` (Today) and `1Y` (1 Year).
- `1D`: Twelve Data `interval=1min`, `outputsize=390` (covers today's 6.5h session). `basePrice` is today's open.
- `1Y`: Twelve Data `interval=1day`, `outputsize=253` (trading days in a year). `basePrice` is 1 year ago.
- Reserved values (return 400 until implemented): `1W`, `1M`, `3M`, `6M`, `5Y`, `MAX`.

Adding `1W` later is a server-only change; the frontend's range selector can ship in a follow-up.

Frontend signature:

```ts
ApiService.getCandles(symbol: string, range: ChartRange = '1D'): Observable<CandlePoint[]>;
```

### Real-time updates are preserved

The live-tick layer **does not disappear** when we switch to long-term data:

- Historical pre-fill (long-term candles) arrives once on symbol click.
- Live WebSocket ticks continue to arrive at sub-second cadence.
- The chart appends each tick as a new data point at the live timestamp. For a 1-day-resolution chart (`1Y`), this means the most recent point on the line is "today, intraday" and it updates as new ticks flow in — visually the line's right edge moves in real time.
- The existing duplicate-time guard at `price-chart.component.ts:145-155` already protects against `time <= lastTime`, so a tick whose floor-to-second equals the last candle's time is skipped harmlessly.

### Decisions made

1. Historical data source is **Twelve Data**.
2. Initial ranges to support: `1D` (1-min resolution) and `1Y` (1-day resolution).
3. **Live Cache Architecture:** To prevent "data gaps" when users switch symbols, the backend will implement a Live Cache.

### Live Cache Architecture (Backend)

To ensure users see a gapless, instantly-loading chart even after switching symbols, the backend must merge historical data with live WebSocket ticks.

**Robust In-Memory Design (MVP):**
- Use a `Map<CacheKey, { lastAccessed: number, candles: CandlePoint[] }>` in a singleton `LiveCandleCacheService`, where `CacheKey = ${symbol}:${range}` (see "Resolved design questions" below for why range is part of the key).
- **Memory Leak Prevention 1 (Stale data):** A background `setInterval` sweeps the Map every minute and `delete`s entries whose `lastAccessed` is older than 15 minutes. `lastAccessed` is updated on read only (`GET /chart/candles`), not on tick append — so a stream nobody is reading still ages out. After deleting the entry, the sweep calls `FinnhubService.unsubscribe(symbol)` (ref-counted, see Q4) so the upstream WS subscription is released too. Otherwise WS subscriptions leak forever.
- **Memory Leak Prevention 2 (Array bounds):** Cap the array length at 30,000 points; when exceeded, shift FIFO. This is a defence-in-depth bound, not the normal operating size: `1D` ≤ 390 (1-min × 6.5 h), `1Y` ≤ 252 (trading days), even raw second-resolution ticks for an 8-h session ≤ 28,800.
- **Tick Merging:** When a WS tick arrives from Finnhub, look up the symbol's cache entries and **update the rightmost candle in place** — set its `value` to the tick price, keep its `time` (start-of-bucket) unchanged. Works for both `1D` (1-min bucket) and `1Y` (1-day bucket) and stays compatible with `lightweight-charts`' duplicate-time guard.
- **On-Demand Fetch:** When a user requests `AAPL` for a given range, if `(AAPL, range)` is in the Map, return it instantly. If not, fetch from Twelve Data, initialize the Map entry, and `FinnhubService.subscribe(symbol)` (ref-counted) if not already subscribed. Concurrent misses for the same `(symbol, range)` share a single in-flight fetch via a `Map<CacheKey, Promise<CacheEntry>>` (see Q5).
- **Persistence:** In-memory only; a NestJS restart loses the cache. Cold-start latency = one Twelve Data fetch per first-request-per-`(symbol, range)`. Accepted for MVP.

**Future Scalability (Multi-instance):**
This design is fully scalable. By abstracting the cache behind an interface (`ICandleCache`), transitioning to a multi-instance architecture simply requires swapping the `Map` for **Redis** (e.g., pushing ticks via `RPUSH` and reading via `LRANGE`, letting Redis handle TTL via `EXPIRE`).

### Resolved design questions

These five points were settled during design review before implementation:

**Q1. Cache key = `(symbol, range)`.** `1D` (1-min, ~390 pts) and `1Y` (1-day, ~252 pts) are completely different time series for the same symbol; keying by symbol alone would have one range overwrite the other. Memory cost is negligible (~650 floats per symbol).

**Q2. Tick merging = update-in-place, not append.** When a tick arrives, the rightmost candle in the array has its `value` overwritten with the tick price; the `time` (start-of-bucket) stays put. For `1D` this means "the latest minute" keeps moving; for `1Y` it means "today's close" keeps moving. No new array entries are pushed by tick merging — only the historical fetch from Twelve Data ever extends the array.

**Q3. Symbol mapping (Finnhub ↔ Twelve Data).** The cache and `FinnhubService` use Finnhub-form symbols (matches the WS channel). Only the outbound HTTP call to Twelve Data translates them:

| Finnhub form | Twelve Data form |
|---|---|
| `AAPL` | `AAPL` |
| `MSFT` | `MSFT` |
| `VOO`  | `VOO` |
| `OANDA:AUD_USD` | `AUD/USD` |

Implemented as a small helper (`apps/api/src/chart/twelve-data-symbol.ts` or similar).

**Q4. WS subscription is reference-counted in `FinnhubService`.** Both watchlist CRUD and `LiveCandleCacheService` call the same `subscribe(symbol)` / `unsubscribe(symbol)` API. Internally:

```ts
private refCounts = new Map<string, number>();
subscribe(symbol)   → refCounts[symbol]++; if was 0, send WS subscribe
unsubscribe(symbol) → refCounts[symbol]--; if now 0, send WS unsubscribe
```

This prevents the cache's TTL eviction from accidentally unsubscribing a symbol that a user still has on a watchlist.

**Q5. Concurrent cache miss is de-duped.** A `Map<CacheKey, Promise<CacheEntry>>` of in-flight Twelve Data fetches ensures two simultaneous clicks for a fresh symbol share one HTTP request, not two — important under the 800 req/day free-tier budget.

### Follow-up implementation work

- Add `TWELVEDATA_API_KEY` to environment variables (`.env`).
- Implement `LiveCandleCacheService` with the Map, GC interval, and array-bounding logic.
- Add `range` query param + DTO validation to `ChartController` (`apps/api/src/chart/chart.controller.ts`).
- Wire Twelve Data API for the initial history fetch. The live-tick path stays on Finnhub WebSocket and routes into the cache.
- Update `apps/web/src/app/core/services/api.service.ts` to forward `range`.
- Default the dashboard chart to `range='1D'`; range selector UI ships separately.

---

**Outstanding Tasks**

- [ ] Implement historical data fetch using Twelve Data API (`/time_series` endpoint).
- [ ] Add `TWELVEDATA_API_KEY` to the environment variables (`.env`).
- [ ] Candlestick support (nice-to-have, post-MVP)
- [ ] Implement `getLastTradingDayOpenUnix()` in `apps/api/src/utils/trading-day.util.ts` — shared utility, reusable by REQ-05
- [ ] Confirm `luxon` or `date-fns-tz` is present in the API package (avoid adding duplicate timezone dependency)
- [ ] `isWeekendOrHoliday()` must cover US market holidays — decide on sharing strategy at implementation time:
  - `apps/web/src/app/core/constants/market-holidays.ts` already exists in the frontend
  - **Option A (simple):** Duplicate the holiday list in the API — acceptable if the list rarely changes
  - **Option B (clean):** Extract to a shared package (e.g. `packages/trading-utils`) within the monorepo — preferred if REQ-05 or other API features also need it
  - **Option C (pragmatic):** Keep it in the web app only and have the API rely solely on weekend detection + a hardcoded short list — acceptable for MVP
  - Whichever option is chosen, the same holiday set must be used consistently across frontend and backend to avoid discrepancies in `basePrice` and market-open/closed status
