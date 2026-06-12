import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FinnhubModule } from '../finnhub/finnhub.module';
import { ChartController } from './chart.controller';
import { ChartService } from './chart.service';
import { LiveCandleCacheService } from './live-candle-cache.service';
import { TwelveDataService } from './twelve-data.service';

@Module({
  imports: [AuthModule, forwardRef(() => FinnhubModule)],
  controllers: [ChartController],
  providers: [ChartService, LiveCandleCacheService, TwelveDataService],
  exports: [LiveCandleCacheService],
})
export class ChartModule {}
