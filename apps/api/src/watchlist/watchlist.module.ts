import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FinnhubModule } from '../finnhub/finnhub.module.js';
import { WatchlistController } from './watchlist/watchlist.controller.js';
import { WatchlistService } from './watchlist/watchlist.service.js';

@Module({
  imports: [AuthModule, FinnhubModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
