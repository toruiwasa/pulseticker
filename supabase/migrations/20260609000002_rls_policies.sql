-- ─── watchlist_items ─────────────────────────────────────────────────────────
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchlist_items: select own" ON public.watchlist_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "watchlist_items: insert own" ON public.watchlist_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watchlist_items: update own" ON public.watchlist_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "watchlist_items: delete own" ON public.watchlist_items
  FOR DELETE USING (auth.uid() = user_id);

-- ─── alerts ──────────────────────────────────────────────────────────────────
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alerts: select own" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alerts: insert own" ON public.alerts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts: update own" ON public.alerts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alerts: delete own" ON public.alerts
  FOR DELETE USING (auth.uid() = user_id);

-- ─── alert_history ───────────────────────────────────────────────────────────
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_history: select own" ON public.alert_history
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alert_history: insert own" ON public.alert_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alert_history: update own" ON public.alert_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alert_history: delete own" ON public.alert_history
  FOR DELETE USING (auth.uid() = user_id);
