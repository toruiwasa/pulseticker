import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';
import { QueueService } from '../../queue/queue.service.js';
import { AlertsService } from './alerts.service.js';

type MockSupabase = { from: jest.Mock };

function makeActiveAlertsChain(alerts: object[]) {
  const eq = jest.fn().mockResolvedValue({ data: alerts, error: null });
  const select = jest.fn(() => ({ eq }));
  return jest.fn(() => ({ select }));
}

async function buildService(supabaseFrom: jest.Mock) {
  const supabaseClient: MockSupabase = { from: supabaseFrom };
  const queueService = { addAlertCheckJob: jest.fn().mockResolvedValue(undefined) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AlertsService,
      { provide: SupabaseService, useValue: { client: supabaseClient } },
      { provide: QueueService, useValue: queueService },
      { provide: EventEmitter2, useValue: new EventEmitter2() },
    ],
  }).compile();

  const service = moduleRef.get(AlertsService);
  await service.onModuleInit();
  return { service, supabaseClient, queueService, moduleRef };
}

describe('AlertsService.onModuleInit (cache loading)', () => {
  it('populates the cache from active alerts on startup', async () => {
    const { service, queueService } = await buildService(
      makeActiveAlertsChain([
        { id: 'a1', symbol: 'AAPL', user_id: 'u1', threshold_price: '200', direction: 'above' },
      ]),
    );

    await service.checkAlerts('AAPL', 210);
    expect(queueService.addAlertCheckJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a1', symbol: 'AAPL' }),
    );
  });

  it('is a no-op on tick when cache is empty (no active alerts)', async () => {
    const { service, queueService } = await buildService(makeActiveAlertsChain([]));
    await service.checkAlerts('AAPL', 999);
    expect(queueService.addAlertCheckJob).not.toHaveBeenCalled();
  });

  it('starts with empty cache when Supabase returns null data with no error', async () => {
    const from = jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    }));
    const queueService = { addAlertCheckJob: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: QueueService, useValue: queueService },
        { provide: EventEmitter2, useValue: new EventEmitter2() },
      ],
    }).compile();
    const service = moduleRef.get(AlertsService);
    await service.onModuleInit();
    await service.checkAlerts('AAPL', 210);
    expect(queueService.addAlertCheckJob).not.toHaveBeenCalled();
  });

  it('re-throws when Supabase returns an error on startup', async () => {
    const from = jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ data: null, error: new Error('db down') }),
      })),
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: QueueService, useValue: { addAlertCheckJob: jest.fn() } },
        { provide: EventEmitter2, useValue: new EventEmitter2() },
      ],
    }).compile();
    const service = moduleRef.get(AlertsService);
    await expect(service.onModuleInit()).rejects.toThrow('db down');
  });
});

describe('AlertsService.checkAlerts', () => {
  async function withAlerts(alerts: { id: string; symbol: string; threshold_price: string; direction: 'above' | 'below' }[]) {
    const rows = alerts.map(a => ({ ...a, user_id: 'u1' }));
    return buildService(makeActiveAlertsChain(rows));
  }

  it('does not add a job when price is below the above-threshold', async () => {
    const { service, queueService } = await withAlerts([
      { id: 'a1', symbol: 'AAPL', threshold_price: '200', direction: 'above' },
    ]);
    await service.checkAlerts('AAPL', 199);
    expect(queueService.addAlertCheckJob).not.toHaveBeenCalled();
  });

  it('does not add a job when price is above the below-threshold', async () => {
    const { service, queueService } = await withAlerts([
      { id: 'a1', symbol: 'AAPL', threshold_price: '150', direction: 'below' },
    ]);
    await service.checkAlerts('AAPL', 151);
    expect(queueService.addAlertCheckJob).not.toHaveBeenCalled();
  });

  it('adds a job when direction=above and price >= threshold', async () => {
    const { service, queueService } = await withAlerts([
      { id: 'a1', symbol: 'AAPL', threshold_price: '200', direction: 'above' },
    ]);
    await service.checkAlerts('AAPL', 200);
    expect(queueService.addAlertCheckJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a1', price: 200 }),
    );
  });

  it('adds a job when direction=below and price <= threshold', async () => {
    const { service, queueService } = await withAlerts([
      { id: 'a1', symbol: 'AAPL', threshold_price: '150', direction: 'below' },
    ]);
    await service.checkAlerts('AAPL', 150);
    expect(queueService.addAlertCheckJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a1', price: 150 }),
    );
  });

  it('only adds jobs for alerts whose threshold is crossed', async () => {
    const { service, queueService } = await withAlerts([
      { id: 'a1', symbol: 'AAPL', threshold_price: '200', direction: 'above' },
      { id: 'a2', symbol: 'AAPL', threshold_price: '300', direction: 'above' },
    ]);
    await service.checkAlerts('AAPL', 250);
    expect(queueService.addAlertCheckJob).toHaveBeenCalledTimes(1);
    expect(queueService.addAlertCheckJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a1' }),
    );
  });

  it('is symbol-case-insensitive', async () => {
    const { service, queueService } = await withAlerts([
      { id: 'a1', symbol: 'AAPL', threshold_price: '200', direction: 'above' },
    ]);
    await service.checkAlerts('aapl', 210);
    expect(queueService.addAlertCheckJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a1' }),
    );
  });
});

describe('AlertsService.createAlert', () => {
  it('inserts and adds the new alert to the cache', async () => {
    const initFrom = makeActiveAlertsChain([]);
    const { service, supabaseClient, queueService } = await buildService(initFrom);

    const newAlert = { id: 'a2', symbol: 'MSFT', user_id: 'u1', threshold_price: '400', direction: 'above' };
    const single = jest.fn().mockResolvedValue({ data: newAlert, error: null });
    const insertSelect = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select: insertSelect }));
    supabaseClient.from = jest.fn(() => ({ insert }));

    await service.createAlert('u1', 'msft', 400, 'above');

    supabaseClient.from = makeActiveAlertsChain([]);
    await service.checkAlerts('MSFT', 450);
    expect(queueService.addAlertCheckJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a2' }),
    );
  });
});

describe('AlertsService.deleteAlert', () => {
  it('removes the alert from cache after delete', async () => {
    const { service, supabaseClient, queueService } = await buildService(
      makeActiveAlertsChain([
        { id: 'a1', symbol: 'AAPL', user_id: 'u1', threshold_price: '200', direction: 'above' },
      ]),
    );

    const eq2 = jest.fn().mockResolvedValue({ error: null });
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const del = jest.fn(() => ({ eq: eq1 }));
    supabaseClient.from = jest.fn(() => ({ delete: del })) as never;

    await service.deleteAlert('u1', 'a1');
    await service.checkAlerts('AAPL', 210);
    expect(queueService.addAlertCheckJob).not.toHaveBeenCalled();
  });
});

describe('AlertsService.handleAlertTriggered', () => {
  it('removes the fired alert from cache so it cannot fire twice', async () => {
    const { service, queueService } = await buildService(
      makeActiveAlertsChain([
        { id: 'a1', symbol: 'AAPL', user_id: 'u1', threshold_price: '200', direction: 'above' },
      ]),
    );

    service.handleAlertTriggered({ alertId: 'a1' });
    await service.checkAlerts('AAPL', 210);
    expect(queueService.addAlertCheckJob).not.toHaveBeenCalled();
  });
});

describe('AlertsService.getAlerts', () => {
  it('returns alerts ordered by created_at desc', async () => {
    const alerts = [{ id: 'a1' }];
    const initFrom = makeActiveAlertsChain([]);
    const { service, supabaseClient } = await buildService(initFrom);

    const order = jest.fn().mockResolvedValue({ data: alerts, error: null });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    supabaseClient.from = jest.fn(() => ({ select }));

    const result = await service.getAlerts('u1');
    expect(result).toEqual(alerts);
  });

  it('throws when supabase returns an error', async () => {
    const { service, supabaseClient } = await buildService(makeActiveAlertsChain([]));
    const order = jest.fn().mockResolvedValue({ data: null, error: new Error('db error') });
    const eq = jest.fn(() => ({ order }));
    const select = jest.fn(() => ({ eq }));
    supabaseClient.from = jest.fn(() => ({ select }));
    await expect(service.getAlerts('u1')).rejects.toThrow('db error');
  });
});

describe('AlertsService.createAlert (error path)', () => {
  it('throws when supabase insert returns an error', async () => {
    const { service, supabaseClient } = await buildService(makeActiveAlertsChain([]));
    const single = jest.fn().mockResolvedValue({ data: null, error: new Error('insert failed') });
    const insertSelect = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select: insertSelect }));
    supabaseClient.from = jest.fn(() => ({ insert }));
    await expect(service.createAlert('u1', 'AAPL', 200, 'above')).rejects.toThrow('insert failed');
  });
});

describe('AlertsService.deleteAlert (error path)', () => {
  it('throws when supabase delete returns an error', async () => {
    const { service, supabaseClient } = await buildService(makeActiveAlertsChain([]));
    const eq2 = jest.fn().mockResolvedValue({ error: new Error('delete failed') });
    const eq1 = jest.fn(() => ({ eq: eq2 }));
    const del = jest.fn(() => ({ eq: eq1 }));
    supabaseClient.from = jest.fn(() => ({ delete: del })) as never;
    await expect(service.deleteAlert('u1', 'a1')).rejects.toThrow('delete failed');
  });
});

describe('AlertsService @OnEvent(price.received)', () => {
  it('queues an alert job when price crosses the threshold via event bus', async () => {
    const from = makeActiveAlertsChain([
      { id: 'a1', symbol: 'AAPL', user_id: 'u1', threshold_price: '200', direction: 'above' },
    ]);
    const queueService = { addAlertCheckJob: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        AlertsService,
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    await moduleRef.init();
    const emitter = moduleRef.get(EventEmitter2);
    await emitter.emitAsync('price.received', { symbol: 'AAPL', price: 210, ts: Date.now() });

    expect(queueService.addAlertCheckJob).toHaveBeenCalledWith(
      expect.objectContaining({ alertId: 'a1', symbol: 'AAPL' }),
    );

    await moduleRef.close();
  });

  it('logs and swallows errors thrown by checkAlerts', async () => {
    const from = makeActiveAlertsChain([
      { id: 'a1', symbol: 'AAPL', user_id: 'u1', threshold_price: '200', direction: 'above' },
    ]);
    const queueService = {
      addAlertCheckJob: jest.fn().mockRejectedValue(new Error('queue down')),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        AlertsService,
        { provide: SupabaseService, useValue: { client: { from } } },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    await moduleRef.init();
    const emitter = moduleRef.get(EventEmitter2);

    await expect(
      emitter.emitAsync('price.received', { symbol: 'AAPL', price: 210, ts: Date.now() }),
    ).resolves.not.toThrow();

    await moduleRef.close();
  });
});
