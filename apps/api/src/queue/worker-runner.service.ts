import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Runner, run } from 'graphile-worker';
import { SupabaseService } from '../supabase/supabase/supabase.service';
import { PreviewCacheService } from '../preview/preview-cache.service';
import { makeCheckPriceAlertTask } from './tasks/check-price-alert';
import { makeFetchPreviewPricesTask } from '../preview/tasks/fetch-preview-prices';
import { SecureLogger } from '../common/logger/secure-logger';

@Injectable()
export class WorkerRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new SecureLogger(WorkerRunnerService.name);
  private runner: Runner | undefined;

  constructor(
    private config: ConfigService,
    private supabase: SupabaseService,
    private eventEmitter: EventEmitter2,
    private previewCache: PreviewCacheService,
  ) {}

  async onModuleInit() {
    try {
      this.runner = await run({
        connectionString: this.config.getOrThrow('DATABASE_URL'),
        taskList: {
          'check-price-alert': makeCheckPriceAlertTask(this.supabase, this.eventEmitter),
          'fetch-preview-prices': makeFetchPreviewPricesTask(this.config, this.previewCache),
        },
        pollInterval: 1000,
        noHandleSignals: true,
      });
      this.logger.log('Graphile worker runner started');
    } catch (err) {
      this.logger.error('Failed to start worker runner', (err as Error).stack);
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.runner?.stop();
  }
}
