import { Module } from '@nestjs/common';
import { PricesGateway } from './prices.gateway.js';
import { FinnhubModule } from '../finnhub/finnhub.module.js';

@Module({
  imports: [FinnhubModule],
  providers: [PricesGateway],
  exports: [PricesGateway],
})
export class GatewayModule {}
