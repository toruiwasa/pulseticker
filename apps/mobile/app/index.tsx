import { StyleSheet, Text, View } from 'react-native';
import { sanitize } from '@pulseticker/logging';
import { WatchlistPricesResponseSchema } from '@pulseticker/schemas';

/**
 * Scaffold smoke screen (Task 7 / #10).
 *
 * Its only job is to prove that Metro resolves both workspace packages from
 * inside apps/mobile. Both are ESM-only with an "exports" map and no CommonJS
 * fallback, so a resolution regression shows up here as a bundling failure
 * rather than at runtime in a later task.
 *
 * Task 10 (#13) replaces this file with the real (tabs) route group.
 */

// Parsed at module scope so a broken resolution cannot be tree-shaken away.
const SAMPLE = WatchlistPricesResponseSchema.safeParse({
  cached: false,
  items: [{ id: '00000000-0000-4000-8000-000000000000', symbol: 'AAPL', price: null, ts: null }],
});

// sanitize() must redact access_token — the same guarantee the mobile logger
// will lean on in Task 9 (#12).
const REDACTION_OK = sanitize({ access_token: 'never-log-me' }).access_token === '[REDACTED]';

export default function SmokeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>pulseticker</Text>
      <Text testID="schemas-check">
        @pulseticker/schemas: {SAMPLE.success ? 'resolved' : 'FAILED'}
      </Text>
      <Text testID="logging-check">
        @pulseticker/logging: {REDACTION_OK ? 'resolved' : 'FAILED'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  heading: { fontSize: 20, fontWeight: '600' },
});
