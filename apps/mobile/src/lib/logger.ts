import { sanitize } from '@pulseticker/logging';

import { Config } from './config';

/**
 * The only permitted console caller in apps/mobile.
 *
 * `data` is `Record<string, unknown>` on purpose (CLAUDE.md > Logging
 * Strategy): a `Session`, `User` or `Error` cannot be passed whole, so the
 * compiler rejects the mistake at the call site instead of sanitize() having to
 * catch it at runtime. sanitize() stays as the second layer, not the first.
 *
 * A browser console is readable by anyone with the device; the same applies to
 * a React Native log stream on a development build. Safe to log: state flags
 * ({ hasSession: true }), event names, `error.name`, navigation targets. Never:
 * tokens, email/phone/name, raw Error objects, the OAuth `?code=` parameter.
 */
type LogData = Record<string, unknown>;

const isProduction = Config.appEnv === 'production';

function format(data?: LogData): [] | [Record<string, unknown>] {
  return data ? [sanitize(data)] : [];
}

export const MobileLogger = {
  /** Development-only flow tracing. Silent in staging and production. */
  debug(tag: string, message: string, data?: LogData): void {
    if (Config.appEnv === 'development') console.debug(`[${tag}]`, message, ...format(data));
  },

  /** Normal business events (sign-in completed, cache hydrated). */
  info(tag: string, message: string, data?: LogData): void {
    if (!isProduction) console.info(`[${tag}]`, message, ...format(data));
  },

  /** Abnormal but recoverable — auth failure, API error with a fallback. */
  warn(tag: string, message: string, data?: LogData): void {
    console.warn(`[${tag}]`, message, ...format(data));
  },

  /** Exceptions and fatal errors. Always recorded, at every environment. */
  error(tag: string, message: string, data?: LogData): void {
    console.error(`[${tag}]`, message, ...format(data));
  },
};
