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

export function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => [
      k,
      REDACTED_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v,
    ])
  );
}
