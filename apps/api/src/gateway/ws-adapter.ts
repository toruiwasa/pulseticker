import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import { INestApplication } from '@nestjs/common';
import { ServerOptions } from 'socket.io';

export class WsAdapter extends IoAdapter {
  readonly corsOrigin: string;

  constructor(app: INestApplication) {
    super(app);
    this.corsOrigin = app.get(ConfigService).getOrThrow<string>('CORS_ORIGIN');
  }

  createIOServer(port: number, options?: ServerOptions) {
    return super.createIOServer(port, { ...options, cors: { origin: this.corsOrigin } });
  }
}
