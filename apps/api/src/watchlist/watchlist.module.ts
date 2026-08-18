import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FinnhubModule } from '../finnhub/finnhub.module.js';
import { SymbolSearchService } from './watchlist/symbol-search.service.js';
import { WatchlistController } from './watchlist/watchlist.controller.js';
import { WatchlistService } from './watchlist/watchlist.service.js';

@Module({
  imports: [AuthModule, FinnhubModule],
  controllers: [WatchlistController],
  providers: [WatchlistService, SymbolSearchService],
})
export class WatchlistModule {}
