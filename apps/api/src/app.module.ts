import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { FinnhubModule } from './finnhub/finnhub.module';
import { GatewayModule } from './gateway/gateway.module';
import { AlertsModule } from './alerts/alerts.module';
import { HealthModule } from './health/health.module';
import { PreviewModule } from './preview/preview.module';
import { ChartModule } from './chart/chart.module';
import { CompanyModule } from './company/company.module';
import { MarketModule } from './market/market.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '../../../.env'),
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
