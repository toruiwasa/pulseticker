import * as path from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { FinnhubModule } from './finnhub/finnhub.module';
import { GatewayModule } from './gateway/gateway.module';
import { AlertsModule } from './alerts/alerts.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '../../../.env'),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow('UPSTASH_REDIS_URL'), tls: {} },
      }),
    }),
    SupabaseModule,
    AuthModule,
    WatchlistModule,
    FinnhubModule,
    GatewayModule,
    AlertsModule,
    HealthModule,
  ],
})
export class AppModule {}
