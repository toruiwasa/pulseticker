## REQ-09: UI/UX — Taiga UI + lightweight-charts + Tailwind

---

### Library Stack

| Role              | Library                          | Reason                                                                            |
| ----------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| Component library | Taiga UI                         | Angular-native, 130+ components, CSS variable theming, signals-ready (Angular 19) |
| Price charts      | lightweight-charts (TradingView) | Purpose-built for financial time-series, MIT license, canvas-based                |
| Utility CSS       | Tailwind (supplementary only)    | Fine-grained spacing and layout adjustments not covered by Taiga UI               |

---

### Theme: Light + Dark

Both modes fully supported. Taiga UI uses CSS variable theming — switching is a class toggle on the root element with no runtime overhead.

```typescript
// theme.service.ts
setTheme(mode: 'light' | 'dark') {
  document.documentElement.classList.toggle('tui-theme-dark', mode === 'dark');
  localStorage.setItem('theme', mode);
}
```

Default: system preference (`prefers-color-scheme`). User override persisted to `localStorage`. Theme toggle in header (sun/moon icon). 

**Theme Tokens & Colors:**
- **Primary Color:** `--tui-primary` set to Deep Indigo (`#2953B2` in light mode, `#4A72D6` in dark mode). Deep Indigo is chosen because financial apps conventionally avoid warm colours (associated with danger/loss); cool blues and indigos convey trust and stability.
- **Financial Status Colors:**
  - Up/Success: `--color-text-success` (`#34D399`)
  - Down/Danger: `--color-text-danger` (`#F87171`)
  - Neutral: `--color-text-neutral` (`#6B7280` light, `#9CA3AF` dark)
- **Backgrounds:**
  - Light Mode: Base `#F9FAFB`, Surface `#FFFFFF`
  - Dark Mode: Base `#111827`, Surface `#1F2937`

lightweight-charts inherits the theme via CSS variables passed into `createChart()` or by responding to theme change events to update grid lines and text colors.

---

### Application Shell

Three-zone layout (no persistent right panel) to prioritize financial data real estate:

```text
┌──────────────────── Header (44px) ────────────────────┐
│ logo · market status · AUD/USD rate · theme · avatar  │
├────────┬──────────────┬──────────────────────────────┤
│Sidebar │  Watchlist   │  Main area                   │
│ (48px) │  (260px)     │  ├─ Chart header             │
│        │              │  ├─ Chart body (1fr)         │
│        │              │  ├─ Stats bar                │
│        │              │  └─ Context accordion (↕)    │
└────────┴──────────────┴──────────────────────────────┘
```

No footer. Financial apps prioritise screen real estate for data.

---

### Header

Always visible. Fixed height 44px. Contents left → right:

- `pulseticker` wordmark
- Market status badge: green "Market open" / red "Market closed" (REQ-04)
- AUD/USD live rate + directional indicator (always visible as orientation anchor)
- Spacer
- Theme toggle button (sun/moon icon)
- User avatar (initials circle) → dropdown: sign out

---

### Left Sidebar (icon-only, 48px)

Navigation icons only. Tooltip on hover. No labels.

| Icon                  | Destination         |
| --------------------- | ------------------- |
| `ti-layout-dashboard` | Dashboard (default) |
| `ti-bell`             | Alerts page         |
| `ti-compass`          | Discover (REQ-14)   |
| —                     | spacer              |
| `ti-settings`         | Settings            |

Active state: filled background (`--color-background-secondary`), full-opacity icon. Alert icon shows a badge dot when unread alerts exist.

---

### Watchlist Panel (260px)

- Symbol search at top (Taiga UI `TuiInput`) → Finnhub autocomplete (REQ-13)
- Ticker rows: symbol + company name left, price + change % right
- Selected ticker: `border-left: 2px solid var(--color-border-info)` + secondary background
- Price colour: green (`--color-text-success`) / red (`--color-text-danger`) / neutral
- Flash animation on price update (REQ-02): Brief subtle background flash (green/red tint) on update.
- "Add symbol" button at bottom (dashed border)
- Swipe-to-delete on mobile

---

### Main Area

**Chart header:**

- Symbol + exchange + full company name
- Current price (22px, bold)
- Absolute change + percentage with directional indicator (▲ ▼)
- Time range tabs: 1D · 5D · 1M · 3M · 1Y (1D is MVP; 5D+ will require `/stock/candle` with resolution parameters like `resolution=D` for daily candles, etc.)

**Chart body:**

- lightweight-charts, `autoSize: true`, transparent background
- Line colour reflects change since today's open (REQ-03)
- Max constraints with whitespace overflow: `max-width: 900px; max-height: 400px`
- **Chart Dynamic Colors:**
  - **Light Mode:** Background `transparent`, Grid lines `#E5E7EB`, Text `#6B7280`, Crosshair `#9CA3AF`
  - **Dark Mode:** Background `transparent`, Grid lines `#374151`, Text `#9CA3AF`, Crosshair `#6B7280`

**Stats bar (below chart):**

- Open · High · Low · Prev close · Volume
- Standard OHLV display — universal financial UI convention

**Context accordion (below stats bar):**

Collapsible section showing company info and recent news for the selected symbol. Data fetched from Finnhub on symbol select, cached server-side (5-minute TTL per symbol).

```text
┌──────────────────────────────────────────┐
│ AAPL — Company info & news          ▼   │  ← click to expand
├──────────────────────────────────────────┤
│ Mkt cap    $3.2T    │  P/E      28.4    │
│ 52w high   $237.23  │  52w low  $164.08 │
│ Dividend   0.44%    │  Beta     1.24    │
├──────────────────────────────────────────┤
│ Recent news                              │
│ · Apple reports record Q2 earnings...   │
│ · iPhone sales beat estimates in Asia.. │
└──────────────────────────────────────────┘
```

State management:

- Closed by default when a new symbol is selected
- User open/close preference persisted to `localStorage` (`pulseticker:context-panel`)
- Preference applied on subsequent symbol selections — user is not forced to re-open every time

```typescript
// context-panel.service.ts
getPreference(): boolean {
  return localStorage.getItem('pulseticker:context-panel') === 'open';
}
setPreference(open: boolean) {
  localStorage.setItem('pulseticker:context-panel', open ? 'open' : 'closed');
}
```

Data sources (no additional API — Finnhub free tier):

| Data                                  | Endpoint                                        |
| ------------------------------------- | ----------------------------------------------- |
| Company profile                       | `GET /stock/profile2?symbol=AAPL`               |
| Financials (P/E, 52w, Beta, dividend) | `GET /stock/metric?symbol=AAPL&metric=all`      |
| Recent news (3–5 items)               | `GET /company-news?symbol=AAPL&from=...&to=...` |

All proxied through NestJS. Cached 5 minutes per symbol. Finnhub API key never exposed to client.

---

### Universal Color Design

Colour is never the only means of conveying information (WCAG 1.4.1).

Adjusted status colours for improved contrast and CVD accessibility:
- Up/Success:   #34D399  (contrast ratio 5.1:1 on dark bg)
- Down/Danger:  #F87171  (contrast ratio 4.8:1 on dark bg)

Every colour indicator is paired with a non-colour redundant cue:
- Price movement:  ▲ ▼ symbol + signed value (+1.24 / −1.24)
- Alert badges:    text label ("Active" / "Triggered") + colour
- Market status:   "Market open" / "Market closed" text + colour dot
- Flash animation: direction (up/down) + colour flash
- Chart lines:     lightweight-charts lines should be distinguishable by thickness or dash pattern if multiple symbols are overlaid.

Testing requirement:
- Verify palette under Deuteranopia and Protanopia simulation (recommended tool: Stark plugin for Figma, or Chrome DevTools Rendering → Emulate vision deficiencies)
- Verify WCAG AA contrast (4.5:1) for all text elements in both light and dark mode

---

### Financial UX Best Practices Applied

| Pattern                           | Implementation                                                    |
| --------------------------------- | ----------------------------------------------------------------- |
| Green/red for up/down             | Universal — never reversed                                        |
| Directional indicators            | ▲ ▼ alongside percentage (colour is never the sole indicator)     |
| Market status always visible      | Header badge — users need to know if data is live                 |
| Price flash animation             | Brief background flash on update (REQ-02) — confirms data is live |
| Previous close as baseline        | Change % calculated from prev close                               |
| Compact data density              | 11–13px font acceptable in data-heavy contexts                    |
| Selected state with accent border | Left border on watchlist item — Bloomberg Terminal convention     |
| Stats bar below chart             | Open / High / Low / Volume — standard OHLV                        |
| Persistent watchlist              | Stored in Supabase per user — survives reload                     |
| Non-blocking alert notification   | Taiga UI `TuiAlertService` toast — user stays on chart            |
| Context panel user-controlled     | State persisted to `localStorage` — respects user preference      |
| Right panel avoided               | Keeps chart width maximised at all times                          |

---

### Responsive Behaviour

| Breakpoint | Layout                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| ≥ 1200px   | Full 3-column layout as above                                                                                                             |
| 768–1199px | Watchlist collapses to icon + slide-out drawer                                                                                            |
| < 768px    | Single column; sidebar becomes bottom tab bar; watchlist and alerts are full-screen views; context accordion stacks below chart naturally |

**Mobile Layout Details (< 768px):**
- **Bottom Tab Bar:** Fixed at the bottom (height 60px) containing 5 touch targets (Dashboard, Watchlist, Discover, Alerts, Settings). Active state uses `--tui-primary` tint.
- **Navigation:** Tapping 'Watchlist' opens a full-screen view. Tapping a ticker navigates to the 'Dashboard' (Chart view) with the new ticker selected.
- **Taiga UI `TuiSheet` (bottom sheet)** can be used for alert detail or quick actions.

---

### Accessibility

- All icon-only buttons have `aria-label`
- Colour never the sole indicator (▲ ▼ accompany green/red)
- Taiga UI components ARIA-compliant by default
- Focus rings on all interactive elements
- Context accordion uses `aria-expanded` on toggle button
- Lightweight-charts canvases need a visually hidden descriptive text fallback for screen readers.

---

### Outstanding Tasks

- [ ] Define custom CSS variables (`--color-text-neutral` etc.) in `styles.scss`
- [ ] Implement lightweight-charts theme switching on mode toggle
- [ ] Implement bottom tab bar for mobile (< 768px)
- [ ] Add aria visually-hidden fallback text for chart canvas
- [ ] Connect time range tabs to `/stock/candle` (post-MVP)
- [ ] REQ-14 Discover tab spec
