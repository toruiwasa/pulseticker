import { forwardRef, Module } from '@nestjs/common';
import { PricesGateway } from './prices.gateway';
import { FinnhubModule } from '../finnhub/finnhub.module';

@Module({
  imports: [forwardRef(() => FinnhubModule)],
  providers: [PricesGateway],
  exports: [PricesGateway],
})
export class GatewayModule {}
