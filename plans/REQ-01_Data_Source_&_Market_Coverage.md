# REQ-01 (Revised): Data Source & Market Coverage

## Use Case

Users monitor real-time prices for US stocks, ETFs, and FX pairs from a single dashboard.
Default watchlist is pre-populated to minimise onboarding friction — users see live data immediately without manual setup.

---

## Technology Selection

Finnhub as the single data source.

| Data Type                    | Source                      | Reason                                              |
| ---------------------------- | --------------------------- | --------------------------------------------------- |
| US Stocks & ETFs             | Finnhub WebSocket           | Free tier: 50 symbols, official API, stable         |
| FX                           | Finnhub WebSocket (OANDA)   | Free tier includes Forex WebSocket                  |
| Symbol Search                | Finnhub REST `/search?q=`   | Official, free, full US coverage                    |
| Fallback Price (Stocks/ETFs) | Finnhub REST `/quote`       | Returns last known price even when market is closed |
| Fallback Price (FX)          | Finnhub WebSocket (first tick) | Free tier: `/forex/rates` returns 403. FX trades 24/5 so the first WebSocket tick arrives within seconds during market hours — no REST fallback needed. |

**Excluded sources:**
- Yahoo Finance: unofficial API, no WebSocket support, breaks without notice.
- Twelve Data: WebSocket free tier weaker than Finnhub for this use case.

---

## Symbol Format

| Asset Class | Internal Format        | Example                          |
| ----------- | ---------------------- | -------------------------------- |
| US Stocks   | Plain ticker           | `AAPL`, `MSFT`                   |
| US ETFs     | Plain ticker           | `VOO`, `SPY`                     |
| FX (OANDA)  | `OANDA:<BASE>_<QUOTE>` | `OANDA:AUD_USD`, `OANDA:AUD_JPY` |

**Display rule for FX:** The `OANDA:` prefix is an internal format. Strip it and replace `_` with `/` before showing to users.

| Context                          | Value           |
| -------------------------------- | --------------- |
| Stored in DB / sent to Finnhub   | `OANDA:AUD_USD` |
| Displayed to user                | `AUD/USD`       |

---

## Default Watchlist (on first login)

Pre-populated on the user's **first** login to give an immediate sense of the product without any manual input.

```
VOO, AAPL, MSFT, OANDA:AUD_USD, OANDA:AUD_JPY
```

**Seed behaviour:**
- Triggered once on first login, tracked via a `user_profiles` table row. If no profile row exists → first visit → seed. Profile row is written atomically with the seed upsert.
- Seed uses idempotent upsert (`onConflict: ignore`). Safe against concurrent requests.
- If the user later removes all symbols, the seed does **not** re-trigger. The empty state is the user's choice.

---

## Watchlist Size Limit

- **Maximum: 50 symbols per user.**
- Rationale: Finnhub free tier WebSocket supports up to 50 simultaneously subscribed symbols. Exceeding this would silently drop subscriptions.
- Enforcement:
  - The Add button and search result selection are **disabled** (greyed out) when the watchlist reaches 50 items.
  - The UI shows a counter: `"12 / 50 symbols"`.
  - The API (`POST /watchlist`) also enforces the limit server-side and returns `400` if exceeded.

---

## Symbol Search & Add UI

### Search-Only Input Pattern
Users **cannot** type an arbitrary symbol string to add directly. The only way to add a symbol is:

1. Type a query into the search input (minimum 1 character).
2. The input triggers a debounced call to Finnhub `/search?q=` via the NestJS proxy.
3. A dropdown appears with up to 10 results.
4. User selects a result via **mouse click** or **arrow keys + Enter**.
5. The selected symbol is added to the watchlist.

This approach prevents invalid or unsupported symbols from entering the system by design — no explicit post-validation step is needed.

### Search Result Filtering
Search results come from two sources merged into a single dropdown (up to 10 results total):
- **US equities** — Finnhub `/search?q=` filtered to `type === 'Common Stock'` or `type === 'ETP'`
- **OANDA FX pairs** — Finnhub `/forex/symbol?exchange=oanda` fetched once and cached in memory on the backend. Searched locally by substring match against symbol and description. Not retrieved from `/search` (which returns FX pairs unreliably).

FX results take up to 5 of the 10 slots; equities fill the rest. All other exchanges (Tokyo, London, Frankfurt, etc.) are excluded.

### Keyboard Navigation
| Key        | Action                                     |
| ---------- | ------------------------------------------ |
| `↓` / `↑` | Move focus between results                 |
| `Enter`    | Select focused result and add to watchlist |
| `Escape`   | Close dropdown, clear search input         |
| `Tab`      | Close dropdown, move focus out             |

---

## Fallback Price Strategy (Outside Market Hours)

### Problem
Finnhub WebSocket only pushes trade ticks during active market hours:
- US Stocks & ETFs: NYSE/NASDAQ hours (EST 09:30–16:00, Mon–Fri, excl. holidays)
- Without a fallback, the dashboard shows `—` outside those hours, which users interpret as a broken app.

### Solution: REST Fallback on Load
On dashboard initialisation, fetch the last known price via REST **before** connecting the WebSocket.
WebSocket ticks overwrite the REST value as soon as they arrive.

**No app-side persistence required.** Finnhub retains the last known price on their side.

### Endpoint Mapping

| Asset Class    | Fallback Endpoint                   | Key Response Fields                                             |
| -------------- | ----------------------------------- | --------------------------------------------------------------- |
| US Stocks/ETFs | `GET /api/v1/quote?symbol={symbol}` | `c` (current/last price), `pc` (previous close), `t` (UNIX ts) |
| FX             | — (no REST fallback)                | FX shows `—` until the first WebSocket tick arrives             |

> **Note:** `/forex/rates` is not available on the Finnhub free tier (returns 403). FX symbols are skipped during REST fallback loading. FX trades 24/5 so the first tick arrives within seconds on weekdays.

### Data Flow on Dashboard Load

```
1. GET /watchlist  →  [VOO, AAPL, MSFT, OANDA:AUD_USD, OANDA:AUD_JPY]

2a. Stocks/ETFs  →  parallel: GET /quote?symbol=VOO
                              GET /quote?symbol=AAPL
                              GET /quote?symbol=MSFT
    → { c: <last price>, t: <timestamp> }

2b. FX  →  no REST call. Prices show `—` until the WebSocket tick arrives (step 5).
    Note: FX trades 24/5, so the first tick arrives within seconds on weekdays.

3. Render table with REST prices for equities (muted style + "Last: <date/time>"); FX rows show `—`

4. Connect WebSocket → subscribe all symbols

5. On each tick: overwrite price + timestamp → restore live style
```

### Rate Limit Safety
- Finnhub free tier: 60 REST calls / min, 30 calls / sec burst
- Default watchlist (5 symbols): 3 `/quote` (equities only) = **3 calls**
- Maximum watchlist (50 symbols): up to 48 `/quote` (equities only; FX symbols skipped) = **≤48 calls** — within limits

---

## Market Status Indicator

A market status badge is shown at the top of the dashboard.

| State         | Badge text        | Colour     | Condition                                                        |
| ------------- | ----------------- | ---------- | ---------------------------------------------------------------- |
| Live          | `● LIVE`          | Green      | Current time is within NYSE trading hours (EST 09:30–16:00, Mon–Fri) |
| Market Closed | `○ Market Closed` | Muted grey | Outside NYSE hours, weekend, or **US Market Holiday**            |

- **NYSE Holiday Calendar:** Must be statically hardcoded for the next 5 years (e.g., 2026–2030).
- The badge is shown once at the top of the dashboard, not per-symbol row.
- FX rows always receive live ticks on weekdays regardless of this badge (FX trades 24/5), but the badge status primarily reflects the equity market.

### Stale Price Visual Rules

| Price source          | Price colour | Timestamp format          |
| --------------------- | ------------ | ------------------------- |
| REST fallback (load)  | Muted / grey | `Last: Jun 6, 16:00 EST`  |
| Live WebSocket tick   | Normal       | `HH:mm:ss` (updates live) |

---

## All Decisions Log

| Topic                     | Decision                                                                  | Rationale                                               |
| ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| Market Hours / Stale Data | REST fallback on load (equities only); no app-side persistence            | Finnhub retains last price; ≤48 REST calls on load      |
| Fallback Price (FX)       | No REST fallback; FX waits for WebSocket first tick                       | Finnhub `/forex/rates` returns 403 on free tier         |
| Watchlist Size Limit      | Max 50 symbols; UI disables add at limit; API enforces with `400`         | Finnhub free WS tier cap                                |
| Symbol Validation         | Search-only input; users select from dropdown, no free-text symbol entry  | Prevents invalid symbols by design; no post-validation  |
| FX Price UI Label         | Price column header stays "Price"; asset type shown per-row if needed     | Deferred — not blocking v1                              |
| FX Display Format         | FX displayed as `AUD/USD`; stored/sent as `OANDA:AUD_USD`                 | Internal format is noise for end users                  |
| Default Watchlist Seed    | Default watchlist seeded once on first login; no re-seed if user empties  | Empty watchlist after deletion is the user's intent     |
| Symbol Search Scope       | Search results filtered to US equities + OANDA FX only                    | Non-US exchanges are out of scope for this product      |
| Market Status Badge       | Market status badge required (`LIVE` / `Market Closed`); hardcode 5 yrs holidays          | Provides accurate market state without external API dependencies      |
| Symbol Addition           | Symbol add is UI-only via search dropdown; no direct API usage by users   | Consistent with search-only input pattern               |

