import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../auth/supabase-auth.guard.js';
import { CompanyService } from './company.service.js';

@UseGuards(SupabaseAuthGuard)
@Controller('company')
export class CompanyController {
  constructor(private company: CompanyService) {}

  @Get('profile')
  profile(@Query('symbol') symbol: string) {
    const sym = symbol?.trim();
    if (!sym) throw new BadRequestException('symbol is required');
    return this.company.getProfile(sym);
  }

  @Get('metrics')
  metrics(@Query('symbol') symbol: string) {
    const sym = symbol?.trim();
    if (!sym) throw new BadRequestException('symbol is required');
    return this.company.getMetrics(sym);
  }

  @Get('news')
  news(@Query('symbol') symbol: string) {
    const sym = symbol?.trim();
    if (!sym) throw new BadRequestException('symbol is required');
    return this.company.getNews(sym);
  }
}
