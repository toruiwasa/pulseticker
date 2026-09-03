import { LEVELS, sanitize, type LogLevel } from '@pulseticker/logging';

import { Config, type AppEnv } from './config';

/**
 * The only permitted console caller in apps/mobile.
 *
 * `data` is `Record<string, unknown>` on purpose (CLAUDE.md > Logging
 * Strategy): a `Session`, `User` or `Error` cannot be passed whole, so the
 * compiler rejects the mistake at the call site instead of sanitize() having to
 * catch it at runtime. sanitize() stays as the second layer, not the first —
 * it redacts a listed key at any depth, but it cannot see inside a class
 * instance, which is what the type constraint above is for.
 *
 * A browser console is readable by anyone with the device; the same applies to
 * a React Native log stream on a development build. Safe to log: state flags
 * ({ hasSession: true }), event names, `error.name`, navigation targets. Never:
 * tokens, email/phone/name, raw Error objects, the OAuth `?code=` parameter.
 *
 * An `Error` whose message may carry a token fragment (Supabase auth, JWT
 * verification) goes through warnWithCause/errorWithCause, never through the
 * plain methods — CLAUDE.md > Logging Strategy §6.
 */
type LogData = Record<string, unknown>;

// Mirrors LOG_LEVEL_MAP in apps/web/scripts/set-env.ts. The policy is one
// table in both clients rather than a boolean per method, so changing what
// staging emits is a single edit that cannot leave one level behind.
const MIN_LEVEL_BY_ENV: Record<AppEnv, LogLevel> = {
  development: 'debug',
  staging: 'info',
  production: 'warn',
};

const minLevel = LEVELS[MIN_LEVEL_BY_ENV[Config.appEnv]];

function format(data?: LogData): [] | [Record<string, unknown>] {
  return data ? [sanitize(data)] : [];
}

function emit(level: LogLevel, tag: string, message: string, data?: LogData): void {
  if (LEVELS[level] < minLevel) return;
  console[level](`[${tag}]`, message, ...format(data));
}

function withCause(
  level: 'warn' | 'error',
  tag: string,
  message: string,
  err: Error,
  extraData?: LogData
): void {
  const safe: LogData = { errorName: err.name, ...extraData };
  if (Config.appEnv === 'development') {
    safe['errorMessage'] = err.message;
    if (level === 'error') safe['errorStack'] = err.stack;
  }
  emit(level, tag, message, safe);
}

export const MobileLogger = {
  /** Development-only flow tracing. Silent in staging and production. */
  debug(tag: string, message: string, data?: LogData): void {
    emit('debug', tag, message, data);
  },

  /** Normal business events (sign-in completed, cache hydrated). */
  info(tag: string, message: string, data?: LogData): void {
    emit('info', tag, message, data);
  },

  /** Abnormal but recoverable — auth failure, API error with a fallback. */
  warn(tag: string, message: string, data?: LogData): void {
    emit('warn', tag, message, data);
  },

  /** Exceptions and fatal errors. Always recorded, at every environment. */
  error(tag: string, message: string, data?: LogData): void {
    emit('error', tag, message, data);
  },

  /**
   * For errors whose `message` may contain a token fragment — Supabase auth,
   * jose/JWT verification. `errorName` is always recorded; the message (and,
   * for errors, the stack) only in development.
   */
  warnWithCause(tag: string, message: string, err: Error, extraData?: LogData): void {
    withCause('warn', tag, message, err, extraData);
  },

  errorWithCause(tag: string, message: string, err: Error, extraData?: LogData): void {
    withCause('error', tag, message, err, extraData);
  },
};
