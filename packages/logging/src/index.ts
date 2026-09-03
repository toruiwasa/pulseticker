export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export const REDACTED_KEYS = new Set([
  'access_token',
  'refresh_token',
  'token',
  'id_token',
  'password',
  'secret',
  'key',
  'authorization',
  'email',
  'phone',
  'name',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// Recursion covers plain objects and arrays only. A class instance — Error,
// Date, a Supabase Session — is passed through untouched, because walking an
// arbitrary prototype serialises a Date to {} and can fire getters with side
// effects. Callers must not pass those in the first place: the LogData type
// each app's logger declares rejects them at the call site, and this function
// is the second layer, not the first.
function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    return value.map((item) => sanitizeValue(item, seen));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    return redactEntries(value, seen);
  }
  return value;
}

function redactEntries(
  data: Record<string, unknown>,
  seen: WeakSet<object>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      REDACTED_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : sanitizeValue(v, seen),
    ])
  );
}

// A redacted key is redacted at every depth. Shallow redaction made the
// guarantee depth-dependent: { context: { access_token } } logged the token
// verbatim while { access_token } did not.
export function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const seen = new WeakSet<object>();
  seen.add(data);
  return redactEntries(data, seen);
}
