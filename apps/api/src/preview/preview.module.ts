import { Module } from '@nestjs/common';
import { PreviewCacheService } from './preview-cache.service';
import { PreviewController } from './preview.controller';

@Module({
  controllers: [PreviewController],
  providers: [PreviewCacheService],
  exports: [PreviewCacheService],
})
export class PreviewModule {}
