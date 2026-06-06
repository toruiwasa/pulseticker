import { Module } from '@nestjs/common';
import { FinnhubService } from './finnhub/finnhub.service';

@Module({
  providers: [FinnhubService]
})
export class FinnhubModule {}
