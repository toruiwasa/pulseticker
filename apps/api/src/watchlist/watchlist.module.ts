import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WatchlistController } from './watchlist/watchlist.controller';
import { WatchlistService } from './watchlist/watchlist.service';

@Module({
  imports: [AuthModule],
  controllers: [WatchlistController],
  providers: [WatchlistService],
})
export class WatchlistModule {}
