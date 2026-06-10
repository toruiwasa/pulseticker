import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Runner, run } from 'graphile-worker';
import { SupabaseService } from '../supabase/supabase/supabase.service';
import { makeCheckPriceAlertTask } from './tasks/check-price-alert';

@Injectable()
export class WorkerRunnerService implements OnModuleInit, OnModuleDestroy {
  private runner: Runner | undefined;

  constructor(
    private config: ConfigService,
    private supabase: SupabaseService,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    this.runner = await run({
      connectionString: this.config.getOrThrow('DATABASE_URL'),
      taskList: {
        'check-price-alert': makeCheckPriceAlertTask(this.supabase, this.eventEmitter),
      },
      pollInterval: 1000,
      noHandleSignals: true,
    });
  }

  async onModuleDestroy() {
    await this.runner?.stop();
  }
}
