## REQ-13: Pre-login Preview

**Use Case**

A visitor lands on pulseticker and immediately sees live market data without logging in. The goal is to demonstrate that the app is alive and functional within seconds of arrival.

**Architecture & Data Flow**

To ensure massive scalability and prevent Finnhub rate-limiting across multiple NestJS instances, the architecture is decoupled:

```text
[ Graphile Worker (runs every 10s) ]
    ↓ exactly 4 Finnhub /quote calls
[ Central Cache (PostgreSQL/Redis) ]
    ↓
[ NestJS API ]
    ↓ Server-Sent Events (SSE) OR REST with Cache-Control
[ Angular Client (RxJS + Visibility API) ]
```

1. **Centralized Fetching:** A Graphile Worker (or a single designated cron instance) runs every 10 seconds. This guarantees Finnhub is called exactly 4 times per 10 seconds, regardless of how many NestJS server instances are running or how many visitors are online.
2. **Smart Frontend Delivery:**
   - **Page Visibility API:** The Angular client uses RxJS to monitor `document.hidden`. It only polls or connects to SSE when the user is actively viewing the tab.
   - **Delivery Method:** NestJS can deliver this via an SSE (`/preview/prices/stream`) connection to avoid HTTP polling overhead, OR via a REST endpoint (`/preview/prices`) with `Cache-Control: public, max-age=10` headers so a CDN like Cloudflare absorbs all the traffic.

**Market Hours Behaviour**

```text
Market open   → Graphile worker runs (interval active)
Market closed → Graphile worker stops
              → last known prices remain displayed
              → "Market Closed" indicator shown (REQ-04)
              → no flash animation triggered
```

Market hours check reuses the logic defined in REQ-04 (time-based + static holiday list).

**Error State**

If a Finnhub call fails:

```text
┌─────────────────────────────────────┐
│ VOO      ---                        │
│ AAPL     ---                        │
│ MSFT     ---                        │
│ AUD/USD  ---                        │
│                                     │
│ ⚠ Market data temporarily           │
│   unavailable                       │
└─────────────────────────────────────┘
```

Prices show `---`. No crash, no infinite spinner. Worker retries on next interval.

**Fixed Symbols**

`VOO, AAPL, MSFT, OANDA:AUD_USD`

Read-only. No watchlist CRUD. No alerts. No WebSocket connection.

**UI Concept**

*   **Design Aesthetic:** Glassmorphism background, vibrant neon color-coding (green for positive, red for negative).
*   **Call to Action:** Prominent "Login with GitHub" button explaining the benefit ("Login for real-time updates").

```text
┌─────────────────────────────────────┐
│ pulseticker                         │
├─────────────────────────────────────┤
│ VOO      $487.00   —  0.00%        │
│ AAPL     $213.42   ▲ +0.58%        │
│ MSFT     $415.10   ▼ −0.55%        │
│ AUD/USD    0.6423  ▲ +0.12%        │
│                                     │
│ ⏱ Prices update every 10 seconds   │
│ 🔒 Login for real-time updates      │
│                                     │
│       [ Login with GitHub ]         │
└─────────────────────────────────────┘
```

**NestJS Implementation Concepts**

*Option A: Edge-Cached REST*
```typescript
@Get('/preview/prices')
@Header('Cache-Control', 'public, max-age=10') // CDN absorbs the traffic!
getPreviewPrices() {
  return this.previewCacheService.getPrices();
}
```

*Option B: Server-Sent Events (SSE)*
```typescript
@Sse('/preview/prices/stream')
streamPrices(): Observable<MessageEvent> {
  // Emits prices every 10 seconds, leveraging RxJS
  return this.previewCacheService.priceStream$.pipe(
    map(prices => ({ data: prices }))
  );
}
```

**Angular Frontend Concept (Smart Polling/SSE)**

Using RxJS to pause consumption when the user switches tabs:

```typescript
// Only fetch when document is visible
const visibility$ = fromEvent(document, 'visibilitychange').pipe(
  map(() => !document.hidden),
  startWith(!document.hidden)
);

this.prices$ = visibility$.pipe(
  switchMap(isVisible => 
    isVisible 
      // If using REST polling:
      // ? timer(0, 10000).pipe(switchMap(() => this.http.get('/preview/prices')))
      // If using SSE:
      ? this.sseService.connect('/preview/prices/stream') 
      : EMPTY
  )
);
```

*Note for Frontend UI:* If the initial fetch fails and the backend returns an empty array `[]`, the frontend must statically render the 4 fixed symbols with the `---` error state.
