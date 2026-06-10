import { forwardRef, Module } from '@nestjs/common';
import { FinnhubService } from './finnhub/finnhub.service';
import { GatewayModule } from '../gateway/gateway.module';
import { AlertsModule } from '../alerts/alerts.module';

@Module({
  imports: [forwardRef(() => GatewayModule), forwardRef(() => AlertsModule)],
  providers: [FinnhubService],
  exports: [FinnhubService],
})
export class FinnhubModule {}
