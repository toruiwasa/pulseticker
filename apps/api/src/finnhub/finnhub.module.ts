import { forwardRef, Module } from '@nestjs/common';
import { FinnhubService } from './finnhub/finnhub.service.js';
import { AlertsModule } from '../alerts/alerts.module.js';

@Module({
  imports: [
    forwardRef(() => AlertsModule),
  ],
  providers: [FinnhubService],
  exports: [FinnhubService],
})
export class FinnhubModule {}
