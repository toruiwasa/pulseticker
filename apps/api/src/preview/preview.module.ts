import { Module } from '@nestjs/common';
import { ChartModule } from '../chart/chart.module';
import { PreviewCacheService } from './preview-cache.service';
import { PreviewController } from './preview.controller';

@Module({
  imports: [ChartModule],
  controllers: [PreviewController],
  providers: [PreviewCacheService],
  exports: [PreviewCacheService],
})
export class PreviewModule {}
