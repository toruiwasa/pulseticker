import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FinnhubModule } from '../finnhub/finnhub.module.js';
import { ChartController } from './chart.controller.js';
import { ChartService } from './chart.service.js';
import { LiveCandleCacheService } from './live-candle-cache.service.js';
import { TwelveDataClient } from './twelve-data.client.js';

@Module({
  imports: [AuthModule, FinnhubModule],
  controllers: [ChartController],
  providers: [ChartService, LiveCandleCacheService, TwelveDataClient],
  exports: [LiveCandleCacheService],
})
export class ChartModule {}
