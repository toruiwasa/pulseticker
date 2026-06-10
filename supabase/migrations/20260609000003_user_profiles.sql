-- ─── user_profiles ───────────────────────────────────────────────────────────
-- Tracks whether each user has been seeded with default watchlist symbols.
-- A row's existence means "this user has been seeded before" — independent
-- of current watchlist contents. This prevents re-seeding when a user
-- intentionally empties their watchlist (REQ-01 behaviour).
CREATE TABLE public.user_profiles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  seeded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles: select own" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);

GRANT ALL ON public.user_profiles TO service_role;

-- ─── Backfill ────────────────────────────────────────────────────────────────
-- Any user who already has watchlist_items rows has effectively been seeded.
-- Insert a profile row for them so they don't get re-seeded on next visit.
INSERT INTO public.user_profiles (user_id, seeded_at)
SELECT user_id, MIN(created_at)
FROM public.watchlist_items
GROUP BY user_id
ON CONFLICT (user_id) DO NOTHING;
