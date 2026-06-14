import { Logger } from '@nestjs/common';
import { sanitize } from '@pulseticker/logging';

export class SecureLogger extends Logger {
  logData(message: string, data: Record<string, unknown>) {
    super.log(`${message} ${JSON.stringify(sanitize(data))}`);
  }

  warnData(message: string, data: Record<string, unknown>) {
    super.warn(`${message} ${JSON.stringify(sanitize(data))}`);
  }

  errorData(message: string, data: Record<string, unknown>, stack?: string) {
    super.error(`${message} ${JSON.stringify(sanitize(data))}`, stack);
  }
}
