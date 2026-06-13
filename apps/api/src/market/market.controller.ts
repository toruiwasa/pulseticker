import { Controller, Get } from '@nestjs/common';
import { isMarketOpen } from '../common/utils/market-hours';

@Controller('market')
export class MarketController {
  @Get('status')
  status() {
    return { isOpen: isMarketOpen(), timestamp: new Date().toISOString() };
  }
}
