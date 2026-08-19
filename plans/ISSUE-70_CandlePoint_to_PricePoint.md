# Issue #70 — CandlePoint → PricePoint, consolidated into packages/schemas

Issue [#70](https://github.com/toruiwasa/pulseticker/issues/70) · Branch `refactor/70-candlepoint-to-pricepoint`

## Decisions

### Option (b): rename AND consolidate — not rename-in-place

The issue posed this as an open decision and forbade drifting from (a) to (b)
mid-task, so it was decided first. (b) was chosen because the duplication —
`apps/api/src/chart/chart.types.ts` and `apps/web/.../api.service.ts` declaring
the same interface independently — is exactly the pattern CLAUDE.md forbids
("never define a separate interface for the same shape"), and the drift risk it
creates is the issue's own stated motivation. Renaming in place would have fixed
the name and kept the defect.

The shape now lives once, as `PricePointSchema` in `packages/schemas` with the
type inferred via `z.infer`, per the schema-first rule. No runtime validation was
added — the schema exists as the single source of the type; every import is
`import type`, so the change is erased at compile time and the wire format
(`time`/`value` field names) is untouched.

### Name: `PricePoint`

Over the issue's other candidates (`SeriesPoint`, `LinePoint`) because it names
the data — a price at a moment — rather than how one client currently renders it.
The API returns data; "line" is a rendering decision that lightweight-charts
makes on the web side.

### Candle-as-concept identifiers kept

Per the issue's judgement-call note: `getCandles()`, the `candles` fields, and
`live-candle-cache.service.ts` still deal in *the Twelve Data 1-min candle feed*
(a real candle source, collapsed to close values) — those names describe the
source, not the shape, and still read correctly. Only the shape was misnamed.

### Noted, not done

`ChartRange` is duplicated the same way (`chart.types.ts` / `api.service.ts`).
Out of #70's scope; it can ride along whenever chart files are next touched. Not
filed as an issue — it is a two-line move with no decision content.

## Verification

- `grep -rn 'CandlePoint' apps packages --include='*.ts'` → only the historical
  note in `chart.schema.ts`'s docstring
- `pnpm build` 6/6 · `pnpm test` 5/5 (no test-behaviour changes — existing chart
  and preview suites are the regression net, per the issue's test boundary)
- `pnpm --filter api lint` exit 0
