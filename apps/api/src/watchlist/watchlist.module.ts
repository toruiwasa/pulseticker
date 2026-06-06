import { Module } from '@nestjs/common';
import { WatchlistController } from './watchlist/watchlist.controller';
import { WatchlistService } from './watchlist/watchlist.service';

@Module({
  controllers: [WatchlistController],
  providers: [WatchlistService]
})
export class WatchlistModule {}
