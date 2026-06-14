import { Logger } from '@nestjs/common';
import { sanitize } from '@pulseticker/logging';

export class SecureLogger extends Logger {
  // Read at call time, not module load — ConfigModule populates process.env
  // during AppModule bootstrap, which runs before any logger method is invoked.
  private get isDev(): boolean {
    return process.env['APP_ENV'] === 'development';
  }

  logData(message: string, data: Record<string, unknown>) {
    super.log(`${message} ${JSON.stringify(sanitize(data))}`);
  }

  warnData(message: string, data: Record<string, unknown>) {
    super.warn(`${message} ${JSON.stringify(sanitize(data))}`);
  }

  errorData(message: string, data: Record<string, unknown>, stack?: string) {
    super.error(`${message} ${JSON.stringify(sanitize(data))}`, stack);
  }

  // Use these for errors from sources whose messages may contain sensitive fragments
  // (Supabase auth, jose JWT verification, etc.). In development, err.message and
  // err.stack are included for debugging. In staging/production, only err.name.
  warnWithCause(message: string, err: Error, extraData?: Record<string, unknown>) {
    const safe: Record<string, unknown> = { errorName: err.name, ...extraData };
    if (this.isDev) safe['errorMessage'] = err.message;
    this.warnData(message, safe);
  }

  errorWithCause(message: string, err: Error, extraData?: Record<string, unknown>) {
    const safe: Record<string, unknown> = { errorName: err.name, ...extraData };
    if (this.isDev) {
      safe['errorMessage'] = err.message;
      this.errorData(message, safe, err.stack);
    } else {
      this.errorData(message, safe);
    }
  }
}
