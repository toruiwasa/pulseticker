import { forwardRef, Module } from '@nestjs/common';
import { FinnhubService } from './finnhub/finnhub.service';
import { GatewayModule } from '../gateway/gateway.module';
import { AlertsModule } from '../alerts/alerts.module';
import { ChartModule } from '../chart/chart.module';

@Module({
  imports: [
    forwardRef(() => GatewayModule),
    forwardRef(() => AlertsModule),
    forwardRef(() => ChartModule),
  ],
  providers: [FinnhubService],
  exports: [FinnhubService],
})
export class FinnhubModule {}
