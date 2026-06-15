import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SupabaseAuthGuard } from '../../auth/supabase-auth.guard.js';
import type { AuthedRequest } from '../../common/types/authed-request.js';
import { WatchlistService } from './watchlist.service.js';

@UseGuards(SupabaseAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(private watchlist: WatchlistService) {}

  @Get('search')
  search(@Query('q') q: string) {
    if (!q?.trim()) throw new BadRequestException('q is required');
    return this.watchlist.searchSymbols(q.trim());
  }

  @Get('quote')
  quote(@Query('symbol') symbol: string) {
    if (!symbol?.trim()) throw new BadRequestException('symbol is required');
    return this.watchlist.getQuote(symbol.trim());
  }

  @Get()
  getAll(@Req() req: AuthedRequest) {
    return this.watchlist.findAll(req.user.userId);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() body: { symbol: string }) {
    return this.watchlist.create(req.user.userId, body.symbol);
  }

  @Delete(':symbol')
  @HttpCode(204)
  remove(@Req() req: AuthedRequest, @Param('symbol') symbol: string) {
    return this.watchlist.remove(req.user.userId, symbol);
  }
}
