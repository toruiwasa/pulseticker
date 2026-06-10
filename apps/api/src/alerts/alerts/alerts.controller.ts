import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../../auth/supabase-auth.guard';
import type { AuthedRequest } from '../../common/types/authed-request';
import { AlertsService } from './alerts.service';

@UseGuards(SupabaseAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get()
  getAlerts(@Req() req: AuthedRequest) {
    return this.alertsService.getAlerts(req.user.userId);
  }

  @Post()
  createAlert(
    @Req() req: AuthedRequest,
    @Body() body: { symbol: string; threshold_price: number; direction: 'above' | 'below' },
  ) {
    return this.alertsService.createAlert(
      req.user.userId,
      body.symbol,
      body.threshold_price,
      body.direction,
    );
  }

  @Delete(':id')
  deleteAlert(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.alertsService.deleteAlert(req.user.userId, id);
  }
}
