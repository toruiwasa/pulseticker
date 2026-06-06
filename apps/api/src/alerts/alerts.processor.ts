import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('alerts', {
  stalledInterval: 300000, // check stalled jobs every 5 min (reduces Upstash command usage)
  drainDelay: 300,         // wait 300ms before declaring queue drained
})
export class AlertsProcessor extends WorkerHost {
  async process(_job: Job): Promise<void> {
    // Phase 3: evaluate threshold, deactivate alert, insert alert_history, emit socket event
  }
}
