# REQ-01: Implementation Design Document

This design document outlines the technical approach to fulfill all requirements specified in `REQ-01_Data_Source_&_Market_Coverage.md`.

## 1. Backend: Watchlist Default Seeding & Limits

### Component: `WatchlistService`
- **Default Seed Configuration:** Define a `DEFAULT_SYMBOLS` array containing `VOO, AAPL, MSFT, OANDA:AUD_USD, OANDA:AUD_JPY`.
- **`findAll(userId)` modification:** 
  - Query the `user_profiles` table for the requesting user (`.maybeSingle()`).
  - If no profile row exists (first login ever), execute an `upsert` with `ignoreDuplicates: true` to insert the default symbols, then insert a `user_profiles` row to mark the user as seeded. Return the seeded items.
  - If a profile row exists, return the watchlist as-is — even if empty (user cleared it intentionally).
- **`create(userId, symbol)` modification:**
  - Before inserting a new symbol, query the current `count` of the user's watchlist.
  - If `count >= 50`, throw a `BadRequestException` (HTTP 400) to enforce the Finnhub free-tier limit.

## 2. Backend: Finnhub REST Proxy

To keep the `FINNHUB_API_KEY` secure, the frontend will not call Finnhub REST APIs directly. Instead, the NestJS backend will proxy these requests.

### Component: `WatchlistController` & `WatchlistService`
- **Symbol Search (`GET /watchlist/search?q=`)**
  - Runs two queries in parallel: (1) Finnhub `/search?q=` filtered to `type === 'Common Stock'` or `type === 'ETP'`; (2) local substring search against a cached OANDA symbol list (from `/forex/symbol?exchange=oanda`, fetched once on first search and held in memory). Merges results — up to 5 FX + remaining equities — truncated to 10 total.
  - Maps to a simplified `{ symbol, description }` interface.
- **Quote Fallback (`GET /watchlist/quote?symbol=`)**
  - Proxies `https://finnhub.io/api/v1/quote?symbol={symbol}&token={apiKey}`.
  - Returns `c` (current price), `pc` (previous close), and `t` (timestamp).
  - _Note: `/forex/rates` was removed — it returns 403 on the Finnhub free tier. FX symbols have no REST fallback; prices wait for the first WebSocket tick._

## 3. Frontend: Core Services & Utilities

### Component: `MarketHolidays` Constant
- Create `apps/web/src/app/core/constants/market-holidays.ts`.
- Store an array of statically coded US market holiday dates (`YYYY-MM-DD` format) spanning 5 years (2026–2030), including New Year's Day, MLK Day, Presidents' Day, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, and Christmas.
- Implement a utility function `isMarketOpen()` that returns `true` if the current time is Mon-Fri, between EST 09:30–16:00, and the current date is not in the holidays array.

### Component: `ApiService`
- Add dedicated methods to call the new backend proxy endpoints: `searchSymbols` and `getQuote`.

## 4. Frontend: Dashboard UI Revamp

### Component: `DashboardComponent`
- **Market Status Badge:** 
  - Utilize `isMarketOpen()` to bind a `● LIVE` (green) or `○ Market Closed` (grey) badge at the top of the dashboard.
- **Symbol Add/Search UI:**
  - Implement a text input bound to a `searchQuery` signal with a `debounceTime(300)` RxJS operator.
  - Display search results in a dropdown menu.
  - Implement Keyboard accessibility (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`).
  - Render the `"Count / 50 symbols"` limit. Disable the search input and dropdown selection if the watchlist reaches 50 symbols.
- **Fallback Price Loading:**
  - After loading the watchlist, filter to equity symbols (non-`OANDA:` prefix).
  - For equities: fire parallel `getQuote(symbol)` requests via `forkJoin`. Store results in `prices` and `timestamps` signals.
  - FX symbols have no REST fallback — they show `—` until the first WebSocket tick arrives. FX trades 24/5 so this is seconds on weekdays.
  - Introduce a new `isLive: Record<string, boolean>` signal to track whether a price came from REST (`false`) or WebSocket (`true`).
- **Formatting & Styling:**
  - Create a Pipe or helper to format `OANDA:AUD_USD` to `AUD/USD` for the UI.
  - If `isLive[symbol] === false`, style the price cell with muted grey and format the timestamp as `Last: MMM d, HH:mm EST`.
  - When a WebSocket `price` event triggers, set `isLive[symbol] = true`, restore normal typography color, and format the timestamp as `HH:mm:ss`.
