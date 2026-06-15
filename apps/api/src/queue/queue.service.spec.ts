import { makeWorkerUtils } from 'graphile-worker';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { QueueService } from './queue.service.js';

jest.mock('graphile-worker', () => ({
  makeWorkerUtils: jest.fn(),
}));

const mockMakeWorkerUtils = makeWorkerUtils as jest.Mock;

describe('QueueService', () => {
  let service: QueueService;
  let workerUtils: { addJob: jest.Mock; release: jest.Mock };

  beforeEach(async () => {
    workerUtils = { addJob: jest.fn().mockResolvedValue(undefined), release: jest.fn().mockResolvedValue(undefined) };
    mockMakeWorkerUtils.mockResolvedValue(workerUtils);

    const moduleRef = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('postgres://test') } },
      ],
    }).compile();

    service = moduleRef.get(QueueService);
    await service.onModuleInit();
  });

  it('initialises workerUtils with the DATABASE_URL', () => {
    expect(mockMakeWorkerUtils).toHaveBeenCalledWith({ connectionString: 'postgres://test' });
  });

  it('seeds the preview fetch job during onModuleInit', () => {
    expect(workerUtils.addJob).toHaveBeenCalledWith('fetch-preview-prices', {}, {
      jobKey: 'preview-fetch',
      jobKeyMode: 'preserve_run_at',
    });
  });

  it('addAlertCheckJob calls workerUtils.addJob with jobKey and replace mode', async () => {
    const payload = { alertId: 'a1', symbol: 'AAPL', price: 200, userId: 'u1' };
    await service.addAlertCheckJob(payload);
    expect(workerUtils.addJob).toHaveBeenCalledWith('check-price-alert', payload, {
      jobKey: 'alert-a1',
      jobKeyMode: 'replace',
    });
  });

  it('seedPreviewFetchJob calls workerUtils.addJob with preserve_run_at mode', async () => {
    await service.seedPreviewFetchJob();
    expect(workerUtils.addJob).toHaveBeenCalledWith('fetch-preview-prices', {}, {
      jobKey: 'preview-fetch',
      jobKeyMode: 'preserve_run_at',
    });
  });

  it('releases workerUtils on destroy', async () => {
    await service.onModuleDestroy();
    expect(workerUtils.release).toHaveBeenCalled();
  });
});
