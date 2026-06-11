import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { PreviewModule } from '../preview/preview.module';
import { QueueService } from './queue.service';
import { WorkerRunnerService } from './worker-runner.service';

@Module({
  imports: [SupabaseModule, PreviewModule],
  providers: [QueueService, WorkerRunnerService],
  exports: [QueueService],
})
export class QueueModule {}
