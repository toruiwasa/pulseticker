## REQ-14: Discover Tab UI/UX Spec

---

### Overview

The **Discover Tab** is a dedicated view designed to help users explore the broader financial market beyond their personalized watchlist. It serves as a central hub for market trends, significant price movements, and global financial news.

This view is accessible via the "Compass" icon in the left sidebar (or the bottom tab bar on mobile).

---

### Layout Structure

The page will follow a scrollable, card-based layout to cleanly segregate different types of market data.

```text
┌────────────────────────────────────────────────────────────┐
│ 🔍 Search for symbols or companies...                      │
├────────────────────────────────────────────────────────────┤
│ 📈 Top Market Movers                                        │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│ │ NVDA        │ │ AAPL        │ │ TSLA        │  (Scroll   │
│ │ +4.2%       │ │ +2.1%       │ │ -3.5%       │   ---->)   │
│ │ $130.50     │ │ $210.30     │ │ $180.20     │            │
│ └─────────────┘ └─────────────┘ └─────────────┘            │
├────────────────────────────────────────────────────────────┤
│ 📰 Global Market News                                       │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🟦 [Image] Fed leaves interest rates unchanged...      │ │
│ │             2 hours ago • Reuters                      │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ 🟦 [Image] Tech stocks rally as AI spending grows...   │ │
│ │             4 hours ago • Bloomberg                    │ │
│ └────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

---

### UI Components (Taiga UI)

| Component | Taiga UI Element | Usage |
| :--- | :--- | :--- |
| **Search Bar** | `TuiInput` with `TuiDataList` | A prominent search bar at the top to find new symbols. Acts identically to the watchlist search (REQ-13). |
| **Movers Cards** | `TuiIsland` or `TuiCard` | Used for individual Top Gainers/Losers. Allows for a compact display of ticker, price, and change percentage. |
| **News Feed** | `TuiBlock` or custom Flexbox | Vertical list of news articles. Each item contains a thumbnail image, headline, source, and timestamp. |
| **Horizontal Scroll** | `TuiScrollbar` | For swiping through the Market Movers cards smoothly, especially on mobile. |

---

### Key Sections

#### 1. Top Market Movers (Gainers & Losers)
- Displays a horizontally scrollable list of stocks that have experienced the most significant percentage changes (up or down) for the day.
- **Card Content:** 
  - Ticker Symbol (e.g., `AMD`)
  - Directional indicator (▲ ▼) and percentage change (color-coded green/red)
  - Current Price
- **Interaction:** Clicking a card immediately navigates the user back to the Main Dashboard with that symbol selected and loaded into the chart.

#### 2. Global Market News
- An aggregated feed of general financial news, independent of the user's watchlist.
- **List Item Content:**
  - Article Thumbnail (if available)
  - Headline (truncated to 2 lines)
  - Source publisher (e.g., "Yahoo Finance")
  - Relative timestamp (e.g., "3h ago")
- **Interaction:** Clicking an article opens the full story in a new browser tab (`target="_blank"`).

---

### Data Sources & Backend Strategy

Since PulseTicker utilizes the Finnhub Free Tier, the backend (NestJS) will need to proxy and potentially cache these requests to avoid rate limits.

| Feature | Proposed Data Source / Strategy |
| :--- | :--- |
| **Market News** | Finnhub `GET /news?category=general`. Fetches general market news. Cache globally on the backend with a 15-minute TTL. |
| **Market Movers** | Finnhub Free Tier does *not* provide a direct "Top Gainers" endpoint. <br><br>**Alternative Strategies:**<br>1. Curate a static list of 20-30 popular large-cap tickers (e.g., AAPL, TSLA, NVDA, SPY) and periodically poll their prices on the backend to determine top movers.<br>2. Integrate a secondary free API (like Yahoo Finance) strictly for a daily market movers list. |

---

### Responsive Behaviour

| Breakpoint | Behaviour |
| :--- | :--- |
| **Desktop (≥ 1200px)** | Grid layout. Movers cards can wrap to a second row instead of scrolling horizontally to utilize wider screen space. |
| **Tablet (768–1199px)** | Horizontal scrolling for Movers cards. News feed takes up 80% of width. |
| **Mobile (< 768px)** | Full-screen view. Search bar sticks to the top. Movers cards use native horizontal swipe. News items stack vertically at 100% width. Accessible via the "Compass" icon on the bottom tab bar. |
