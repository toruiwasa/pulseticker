import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard.js';
import { ChartService } from './chart.service.js';
import { ChartRange, RESERVED_RANGES, SUPPORTED_RANGES } from './chart.types.js';

@UseGuards(SupabaseAuthGuard)
@Controller('chart')
export class ChartController {
  constructor(private chart: ChartService) {}

  @Get('candles')
  candles(@Query('symbol') symbol: string, @Query('range') range?: string) {
    const trimmedSymbol = symbol?.trim();
    if (!trimmedSymbol) throw new BadRequestException('symbol is required');

    const trimmedRange = range?.trim() || '1D';
    if ((RESERVED_RANGES as readonly string[]).includes(trimmedRange)) {
      throw new BadRequestException(`range "${trimmedRange}" is reserved and not yet implemented`);
    }
    if (!(SUPPORTED_RANGES as readonly string[]).includes(trimmedRange)) {
      throw new BadRequestException(`range must be one of ${SUPPORTED_RANGES.join(', ')}`);
    }

    return this.chart.getCandles(trimmedSymbol, trimmedRange as ChartRange);
  }
}
