import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ZodError } from 'zod';
import { CreateAlertSchema } from '@pulseticker/schemas';
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
    @Body() body: unknown,
  ) {
    let dto: ReturnType<typeof CreateAlertSchema.parse>;
    try {
      dto = CreateAlertSchema.parse(body);
    } catch (e) {
      if (e instanceof ZodError) throw new BadRequestException(e.errors);
      throw e;
    }
    return this.alertsService.createAlert(
      req.user.userId,
      dto.symbol,
      dto.threshold_price,
      dto.direction,
    );
  }

  @Delete(':id')
  deleteAlert(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.alertsService.deleteAlert(req.user.userId, id);
  }
}
