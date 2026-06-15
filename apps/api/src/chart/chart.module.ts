import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FinnhubModule } from '../finnhub/finnhub.module.js';
import { ChartController } from './chart.controller.js';
import { ChartService } from './chart.service.js';
import { LiveCandleCacheService } from './live-candle-cache.service.js';
import { TwelveDataService } from './twelve-data.service.js';

@Module({
  imports: [AuthModule, forwardRef(() => FinnhubModule)],
  controllers: [ChartController],
  providers: [ChartService, LiveCandleCacheService, TwelveDataService],
  exports: [LiveCandleCacheService],
})
export class ChartModule {}
