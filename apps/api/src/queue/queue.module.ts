import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module.js';
import { PreviewModule } from '../preview/preview.module.js';
import { QueueService } from './queue.service.js';
import { WorkerRunnerService } from './worker-runner.service.js';

@Module({
  imports: [SupabaseModule, PreviewModule],
  providers: [QueueService, WorkerRunnerService],
  exports: [QueueService],
})
export class QueueModule {}
