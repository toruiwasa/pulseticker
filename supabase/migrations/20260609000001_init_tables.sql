-- ─── watchlist_items ─────────────────────────────────────────────────────────
CREATE TABLE public.watchlist_items (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, symbol)
);

-- ─── alerts ──────────────────────────────────────────────────────────────────
CREATE TABLE public.alerts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  threshold_price NUMERIC(12,4) NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('above','below')),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── alert_history ───────────────────────────────────────────────────────────
CREATE TABLE public.alert_history (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id         UUID REFERENCES public.alerts(id) ON DELETE SET NULL,
  symbol           TEXT NOT NULL,
  triggered_at     TIMESTAMPTZ DEFAULT NOW(),
  price_at_trigger NUMERIC(12,4) NOT NULL,
  message          TEXT
);

-- ─── service_role grants ─────────────────────────────────────────────────────
-- Tables created via SQL Editor do NOT automatically grant privileges to
-- service_role. Must be explicit.
GRANT ALL ON public.watchlist_items  TO service_role;
GRANT ALL ON public.alerts           TO service_role;
GRANT ALL ON public.alert_history    TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
