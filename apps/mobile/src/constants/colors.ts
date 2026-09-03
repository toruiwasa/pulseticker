/**
 * Mobile design tokens.
 *
 * Derived from the web palette in apps/web/src/styles.css (--pt-*) so the two
 * clients read as one product. REQ-17 specifies the mobile UX in terms of
 * behaviour ("amber banner", "red banner") and names no hex values, so the
 * shared tokens are the source and only the two banner families are new.
 *
 * Light only, deliberately: REQ-17 Phase 1 specifies no dark palette, and a
 * second unspecified palette would be invented, not designed. app.json's
 * `userInterfaceStyle` is pinned to "light" to match — see the PR for #12.
 * That pin takes effect on iOS only: Expo's app config reference states it
 * "Requires `expo-system-ui` be installed in your project to work on Android",
 * and that package is not a dependency here. Nothing reads useColorScheme yet,
 * so no screen is affected; adding the package needs a device build, which is
 * blocked on #95. Dark mode is tracked separately.
 */
export const colors = {
  // Brand / interactive — Google sign-in button, tab bar active tint
  primary: '#2953B2',
  primaryPressed: '#1E3F8A',
  onPrimary: '#FFFFFF',

  // Surfaces
  background: '#F9FAFB',
  surface: '#FFFFFF',
  elevated: '#F3F4F6',
  border: '#E5E7EB',

  // Text
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Price movement — same pair the web watchlist uses
  priceUp: '#34D399',
  priceDown: '#F87171',

  // Stale warning banner (age 60s–5min) — REQ-17 watchlist state 5
  warningBackground: '#FEF3C7',
  warningBorder: '#F59E0B',
  warningText: '#92400E',

  // Disconnected / offline banner (age > 5min, or NetInfo offline) —
  // REQ-17 watchlist states 6 and 7
  dangerBackground: '#FEE2E2',
  dangerBorder: '#DC2626',
  dangerText: '#991B1B',

  // Skeleton rows — REQ-17 watchlist state 1
  skeleton: '#E5E7EB',
} as const;
