import { EventEmitter2 } from '@nestjs/event-emitter';
import { makeCheckPriceAlertTask } from './check-price-alert.js';

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  threshold_price: string;
  direction: 'above' | 'below';
  is_active: boolean;
}

const baseAlert: AlertRow = {
  id: 'a1',
  user_id: 'u1',
  symbol: 'AAPL',
  threshold_price: '200.0000',
  direction: 'above',
  is_active: true,
};

function makeSupabase(alert: AlertRow | null) {
  const single = jest.fn().mockResolvedValue({ data: alert, error: null });
  const eqActive = jest.fn(() => ({ single }));
  const eqId = jest.fn(() => ({ eq: eqActive }));
  const select = jest.fn(() => ({ eq: eqId }));
  return { client: { from: jest.fn(() => ({ select })) } };
}

function makeSupabaseWithWrites(alert: AlertRow) {
  const single = jest.fn().mockResolvedValue({ data: alert, error: null });
  const eqActive = jest.fn(() => ({ single }));
  const eqId = jest.fn(() => ({ eq: eqActive }));
  const select = jest.fn(() => ({ eq: eqId }));
  const update = { eq: jest.fn().mockResolvedValue({ error: null }) };
  const insert = jest.fn().mockResolvedValue({ error: null });

  const from = jest.fn((table: string) => {
    if (table === 'alerts') return { select: () => ({ eq: eqId }), update: jest.fn(() => update) };
    if (table === 'alert_history') return { insert };
    throw new Error(`unexpected table: ${table}`);
  });

  return { client: { from }, update, insert };
}

describe('makeCheckPriceAlertTask', () => {
  let eventEmitter: EventEmitter2;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    emitSpy = jest.spyOn(eventEmitter, 'emit');
  });

  it('is a no-op when the alert is no longer active', async () => {
    const supabase = makeSupabase(null);
    const task = makeCheckPriceAlertTask(supabase as never, eventEmitter);
    await task({ alertId: 'a1', symbol: 'AAPL', price: 250, userId: 'u1' });
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('is a no-op when condition is no longer met (price bounced)', async () => {
    const supabase = makeSupabase(baseAlert);
    const task = makeCheckPriceAlertTask(supabase as never, eventEmitter);
    await task({ alertId: 'a1', symbol: 'AAPL', price: 199, userId: 'u1' });
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('processes direction=above when price >= threshold', async () => {
    const supabase = makeSupabaseWithWrites(baseAlert);
    const task = makeCheckPriceAlertTask(supabase as never, eventEmitter);
    await task({ alertId: 'a1', symbol: 'AAPL', price: 210, userId: 'u1' });

    expect(supabase.update.eq).toHaveBeenCalledWith('id', 'a1');
    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({ alert_id: 'a1', price_at_trigger: 210, user_id: 'u1' }),
    );
    expect(emitSpy).toHaveBeenCalledWith(
      'alert.triggered',
      expect.objectContaining({ alertId: 'a1', userId: 'u1', symbol: 'AAPL', price: 210 }),
    );
  });

  it('processes direction=below when price <= threshold', async () => {
    const belowAlert: AlertRow = { ...baseAlert, direction: 'below', threshold_price: '150.0000' };
    const supabase = makeSupabaseWithWrites(belowAlert);
    const task = makeCheckPriceAlertTask(supabase as never, eventEmitter);
    await task({ alertId: 'a1', symbol: 'AAPL', price: 149, userId: 'u1' });

    expect(supabase.update.eq).toHaveBeenCalledWith('id', 'a1');
    expect(emitSpy).toHaveBeenCalledWith(
      'alert.triggered',
      expect.objectContaining({ direction: 'below', price: 149 }),
    );
  });
});
