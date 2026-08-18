import { z } from 'zod';

/**
 * A row of `GET /alerts`, which is `select('*')` on the `alerts` table.
 *
 * Status is carried by `is_active`, not by a trigger timestamp: `alerts` has no
 * `triggered_at` column. Firing sets `is_active = false` (the only place it is
 * ever written) and inserts a separate `alert_history` row that nothing
 * currently reads. `is_active === false` therefore means "triggered" — the same
 * mapping the web app already uses. See the correction note in
 * plans/REQ-17_Mobile_App_MVP.md.
 *
 * Deliberately strict in three places, so that a drift in the API surfaces as a
 * parse failure instead of a wrong label:
 *
 * - `threshold_price` is `z.number()`, not a coerced/union type. The column is
 *   NUMERIC(12,4) and PostgREST serialises numeric as a JSON number. If the API
 *   ever adds a `::text` cast (the usual precision-preserving workaround), this
 *   must fail rather than silently parse.
 * - `is_active` is `z.boolean()`, not nullable. The column has no NOT NULL, but
 *   nothing inserts null — a null here would otherwise render as "triggered".
 * - `created_at` is `z.string()`, not `z.iso.datetime()`. PostgREST returns
 *   timestamptz as `...+00:00`, which zod's default `z.iso.datetime()` rejects
 *   (it requires a `Z` suffix unless `{ offset: true }` is passed).
 *
 * `user_id` is present in the response but omitted here: unknown keys are
 * stripped by default, so the identifier never reaches the mobile client.
 */
export const AlertReadSchema = z.object({
  id:              z.uuid(),
  symbol:          z.string(),
  threshold_price: z.number(),
  direction:       z.enum(['above', 'below']),
  is_active:       z.boolean(),  // true = pending, false = triggered
  created_at:      z.string(),
});

export const AlertsResponseSchema = z.array(AlertReadSchema);

export type AlertRead = z.infer<typeof AlertReadSchema>;
