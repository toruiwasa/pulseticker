import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';
import { SecureLogger } from '../common/logger/secure-logger.js';

export interface AlertJobPayload {
  alertId: string;
  symbol: string;
  price: number;
  userId: string;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new SecureLogger(QueueService.name);
  private workerUtils: WorkerUtils;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    try {
      this.workerUtils = await makeWorkerUtils({
        connectionString: this.config.getOrThrow('DATABASE_URL'),
      });
      await this.seedPreviewFetchJob();
      this.logger.log('Queue worker utils initialized');
    } catch (err) {
      this.logger.error('Failed to initialize worker utils', (err as Error).stack);
      throw err;
    }
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
