import { join } from 'path';
import { fileURLToPath } from 'url';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SupabaseModule } from './supabase/supabase.module.js';
import { AuthModule } from './auth/auth.module.js';
import { WatchlistModule } from './watchlist/watchlist.module.js';
import { FinnhubModule } from './finnhub/finnhub.module.js';
import { GatewayModule } from './gateway/gateway.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { HealthModule } from './health/health.module.js';
import { PreviewModule } from './preview/preview.module.js';
import { ChartModule } from './chart/chart.module.js';
import { CompanyModule } from './company/company.module.js';
import { MarketModule } from './market/market.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(fileURLToPath(new URL('.', import.meta.url)), '../../../.env'),
    }),
    EventEmitterModule.forRoot(),
    SupabaseModule,
    AuthModule,
    WatchlistModule,
    FinnhubModule,
    GatewayModule,
    AlertsModule,
    HealthModule,
    PreviewModule,
    ChartModule,
    CompanyModule,
    MarketModule,
  ],
})
export class AppModule {}
