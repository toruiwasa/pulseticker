import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { ChartService } from './chart.service';

@UseGuards(SupabaseAuthGuard)
@Controller('chart')
export class ChartController {
  constructor(private chart: ChartService) {}

  @Get('candles')
  candles(@Query('symbol') symbol: string) {
    const trimmed = symbol?.trim();
    if (!trimmed) throw new BadRequestException('symbol is required');
    return this.chart.getCandles(trimmed);
  }
}
