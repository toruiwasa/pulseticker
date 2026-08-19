import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { WsAdapter } from './gateway/ws-adapter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const wsAdapter = new WsAdapter(app);
  app.enableCors({ origin: wsAdapter.corsOrigin });
  app.useWebSocketAdapter(wsAdapter);
  await app.listen(process.env.PORT ?? 3000);
}
// A rejected bootstrap must not become an unhandled rejection — Render would
// report the process as healthy while nothing is listening.
bootstrap().catch(err => {
  console.error('Failed to start', err);
  process.exit(1);
});
