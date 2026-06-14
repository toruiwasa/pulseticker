import { Injectable } from '@angular/core';
import { LogLevel, LEVELS, sanitize } from '@pulseticker/logging';
import { environment } from '../../../environments/environment';

const COLORS: Record<LogLevel, string> = {
  debug: 'color: #888',
  info:  'color: #4fc3f7',
  warn:  'color: #ffb74d',
  error: 'color: #ef5350; font-weight: bold',
};

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private minLevel = LEVELS[(environment.logLevel as LogLevel) ?? 'warn'];

  debug(ctx: string, msg: string, data?: Record<string, unknown>) { this.log('debug', ctx, msg, data); }
  info (ctx: string, msg: string, data?: Record<string, unknown>) { this.log('info',  ctx, msg, data); }
  warn (ctx: string, msg: string, data?: Record<string, unknown>) { this.log('warn',  ctx, msg, data); }
  error(ctx: string, msg: string, data?: Record<string, unknown>) { this.log('error', ctx, msg, data); }

  // Use this for errors whose message may contain sensitive fragments
  // (Supabase auth, JWT errors, etc.). In development, err.message is included
  // for debugging. In staging/production, only err.name.
  warnWithCause(ctx: string, msg: string, err: Error, extraData?: Record<string, unknown>) {
    this.withCause('warn', ctx, msg, err, extraData);
  }

  errorWithCause(ctx: string, msg: string, err: Error, extraData?: Record<string, unknown>) {
    this.withCause('error', ctx, msg, err, extraData);
  }

  private withCause(level: 'warn' | 'error', ctx: string, msg: string, err: Error, extraData?: Record<string, unknown>) {
    const safe: Record<string, unknown> = { errorName: err.name, ...extraData };
    if (environment.appEnv === 'development') safe['errorMessage'] = err.message;
    this.log(level, ctx, msg, safe);
  }

  private log(level: LogLevel, ctx: string, msg: string, data?: Record<string, unknown>) {
    if (LEVELS[level] < this.minLevel) return;
    const ts   = new Date().toTimeString().slice(0, 8);
    const args: unknown[] = [`%c[${ts}][${level.toUpperCase()}][${ctx}] ${msg}`, COLORS[level]];
    if (data !== undefined) args.push(sanitize(data));
    console[level](...args);
  }
}
