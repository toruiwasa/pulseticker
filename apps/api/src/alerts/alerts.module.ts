import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AlertsController } from './alerts/alerts.controller';
import { AlertsService } from './alerts/alerts.service';
import { AlertsProcessor } from './alerts.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'alerts' })],
  controllers: [AlertsController],
  providers: [AlertsService, AlertsProcessor],
})
export class AlertsModule {}
