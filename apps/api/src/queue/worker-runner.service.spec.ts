import { run } from 'graphile-worker';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../supabase/supabase/supabase.service';
import { PreviewCacheService } from '../preview/preview-cache.service';
import { WorkerRunnerService } from './worker-runner.service';

jest.mock('graphile-worker', () => ({ run: jest.fn() }));
jest.mock('./tasks/check-price-alert', () => ({ makeCheckPriceAlertTask: jest.fn().mockReturnValue(jest.fn()) }));
jest.mock('../preview/tasks/fetch-preview-prices', () => ({ makeFetchPreviewPricesTask: jest.fn().mockReturnValue(jest.fn()) }));

const mockRun = run as jest.Mock;

describe('WorkerRunnerService', () => {
  let service: WorkerRunnerService;
  let runner: { stop: jest.Mock };

  beforeEach(async () => {
    runner = { stop: jest.fn().mockResolvedValue(undefined) };
    mockRun.mockResolvedValue(runner);

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkerRunnerService,
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('postgres://test') } },
        { provide: SupabaseService, useValue: { client: {} } },
        { provide: EventEmitter2, useValue: new EventEmitter2() },
        { provide: PreviewCacheService, useValue: { getPrices: jest.fn(), setPrices: jest.fn(), prices$: { pipe: jest.fn() } } },
      ],
    }).compile();

    service = moduleRef.get(WorkerRunnerService);
  });

  it('starts graphile-worker with both tasks registered on init', async () => {
    await service.onModuleInit();
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: 'postgres://test',
        pollInterval: 1000,
        noHandleSignals: true,
        taskList: expect.objectContaining({
          'check-price-alert': expect.any(Function),
          'fetch-preview-prices': expect.any(Function),
        }),
      }),
    );
  });

  it('stops the runner on destroy', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(runner.stop).toHaveBeenCalled();
  });

  it('does not throw on destroy if runner was never started', async () => {
    await expect(service.onModuleDestroy()).resolves.not.toThrow();
  });
});
