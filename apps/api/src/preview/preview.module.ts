import { Module } from '@nestjs/common';
import { ChartModule } from '../chart/chart.module.js';
import { PreviewCacheService } from './preview-cache.service.js';
import { PreviewController } from './preview.controller.js';

@Module({
  imports: [ChartModule],
  controllers: [PreviewController],
  providers: [PreviewCacheService],
  exports: [PreviewCacheService],
})
export class PreviewModule {}
