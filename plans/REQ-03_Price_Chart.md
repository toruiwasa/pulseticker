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

**Outstanding Tasks**

- [ ] Verify `/stock/candle` availability on Finnhub free tier at implementation time
- [ ] Candlestick support (nice-to-have, post-MVP)
- [ ] Implement `getLastTradingDayOpenUnix()` in `apps/api/src/utils/trading-day.util.ts` — shared utility, reusable by REQ-05
- [ ] Confirm `luxon` or `date-fns-tz` is present in the API package (avoid adding duplicate timezone dependency)
- [ ] `isWeekendOrHoliday()` must cover US market holidays — decide on sharing strategy at implementation time:
  - `apps/web/src/app/core/constants/market-holidays.ts` already exists in the frontend
  - **Option A (simple):** Duplicate the holiday list in the API — acceptable if the list rarely changes
  - **Option B (clean):** Extract to a shared package (e.g. `packages/trading-utils`) within the monorepo — preferred if REQ-05 or other API features also need it
  - **Option C (pragmatic):** Keep it in the web app only and have the API rely solely on weekend detection + a hardcoded short list — acceptable for MVP
  - Whichever option is chosen, the same holiday set must be used consistently across frontend and backend to avoid discrepancies in `basePrice` and market-open/closed status
