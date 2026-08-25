import { Module } from '@nestjs/common';
import { FinnhubClient } from './finnhub/finnhub.client.js';
import { PriceCacheService } from './finnhub/price-cache.service.js';
import { SubscriptionRegistry } from './finnhub/subscription-registry.js';

@Module({
  providers: [FinnhubClient, SubscriptionRegistry, PriceCacheService],
  exports: [SubscriptionRegistry, PriceCacheService],
})
export class FinnhubModule {}
