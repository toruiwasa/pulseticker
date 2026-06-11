import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';

export interface AlertJobPayload {
  alertId: string;
  symbol: string;
  price: number;
  userId: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private workerUtils: WorkerUtils;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.workerUtils = await makeWorkerUtils({
      connectionString: this.config.getOrThrow('DATABASE_URL'),
    });
  }

  async onModuleDestroy() {
    await this.workerUtils?.release();
  }

  async addAlertCheckJob(payload: AlertJobPayload) {
    await this.workerUtils.addJob('check-price-alert', payload, {
      jobKey: `alert-${payload.alertId}`,
      jobKeyMode: 'replace',
    });
  }

  async seedPreviewFetchJob() {
    await this.workerUtils.addJob('fetch-preview-prices', {}, {
      jobKey: 'preview-fetch',
      jobKeyMode: 'preserve_run_at',
    });
  }
}
