jest.mock('ws');
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import { FinnhubService } from './finnhub.service.js';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';

const WS_OPEN = 1;
const WS_CONNECTING = 0;

class FakeWS {
  static lastInstance: FakeWS;
  readyState = WS_OPEN;
  send = jest.fn();
  close = jest.fn();
  private handlers: Record<string, (...args: unknown[]) => void> = {};

  constructor() {
    FakeWS.lastInstance = this;
  }

  on(ev: string, cb: (...args: unknown[]) => void) {
    this.handlers[ev] = cb;
  }

  trigger(ev: string, ...args: unknown[]) {
    this.handlers[ev]?.(...args);
  }
}

beforeEach(() => {
  (WebSocket as unknown as jest.Mock).mockImplementation(() => new FakeWS());
  (WebSocket as unknown as { OPEN: number }).OPEN = WS_OPEN;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

function makeSupabaseMock(rows: { symbol: string }[] = []) {
  return {
    client: {
      from: jest.fn(() => ({
        select: jest.fn().mockResolvedValue({ data: rows, error: null }),
      })),
    },
  };
}

async function buildService(supabaseRows: { symbol: string }[] = []) {
  const config = { getOrThrow: jest.fn().mockReturnValue('test-key') };
  const eventEmitter = { emit: jest.fn() };
  const supabase = makeSupabaseMock(supabaseRows);

  const moduleRef = await Test.createTestingModule({
    providers: [
      FinnhubService,
      { provide: ConfigService, useValue: config },
      { provide: EventEmitter2, useValue: eventEmitter },
      { provide: SupabaseService, useValue: supabase },
    ],
  }).compile();

  const service = moduleRef.get(FinnhubService);
  return { service, eventEmitter, supabase };
}

describe('FinnhubService', () => {
  describe('onModuleInit()', () => {
    it('opens a WebSocket connection to Finnhub', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      expect(WebSocket).toHaveBeenCalledTimes(1);
      expect((WebSocket as unknown as jest.Mock).mock.calls[0][0]).toMatch(/wss:\/\/ws\.finnhub\.io/);
    });
  });

  describe('open handler', () => {
    it('re-subscribes tracked symbols on (re)connect', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws1 = FakeWS.lastInstance;
      ws1.trigger('open');

      service.subscribe('AAPL');

      ws1.trigger('close');
      jest.advanceTimersByTime(1000);

      const ws2 = FakeWS.lastInstance;
      ws2.trigger('open');

      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }));
    });

    it('does NOT reset reconnectDelay before the 60 s stability window', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws1 = FakeWS.lastInstance;

      // First close uses 1 000 ms; delay doubles to 2 000 ms for next time
      ws1.trigger('close');
      jest.advanceTimersByTime(1000);

      const ws2 = FakeWS.lastInstance;
      ws2.trigger('open'); // starts stable timer — do NOT let it fire

      // Close before 60 s: delay is still 2 000 ms (not reset)
      ws2.trigger('close');
      jest.advanceTimersByTime(1999);
      expect(WebSocket).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(3); // reconnects at 2 000 ms
    });

    it('resets reconnectDelay to 1 000 ms after the 60 s stability window', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws1 = FakeWS.lastInstance;

      ws1.trigger('close');
      jest.advanceTimersByTime(1000);
      const ws2 = FakeWS.lastInstance;
      ws2.trigger('open');

      // Let the stability window elapse
      jest.advanceTimersByTime(60_000);

      // Now delay has been reset — next close reconnects in 1 000 ms
      ws2.trigger('close');
      jest.advanceTimersByTime(999);
      expect(WebSocket).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(3);
    });
  });

  describe('message handler', () => {
    it('emits price.received event for each trade', async () => {
      const { service, eventEmitter } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      const msg = JSON.stringify({
        type: 'trade',
        data: [{ s: 'AAPL', p: 185.5, t: 1000 }],
      });
      ws.trigger('message', Buffer.from(msg));

      expect(eventEmitter.emit).toHaveBeenCalledWith('price.received', { symbol: 'AAPL', price: 185.5, ts: 1000 });
    });

    it('populates the price cache on each trade', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('message', Buffer.from(JSON.stringify({
        type: 'trade',
        data: [{ s: 'AAPL', p: 185.5, t: 1000 }],
      })));

      expect(service.getLastKnownPrices(['AAPL'])).toEqual([
        { symbol: 'AAPL', price: 185.5, ts: 1000 },
      ]);
    });

    it('ignores non-trade message types', async () => {
      const { service, eventEmitter } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('message', Buffer.from(JSON.stringify({ type: 'ping' })));

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not throw on invalid JSON', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      expect(() => ws.trigger('message', Buffer.from('{bad json'))).not.toThrow();
    });
  });

  describe('getLastKnownPrices()', () => {
    it('returns null price and ts for an unseen symbol', async () => {
      const { service } = await buildService();
      expect(service.getLastKnownPrices(['AAPL'])).toEqual([
        { symbol: 'AAPL', price: null, ts: null },
      ]);
    });

    it('returns cached price after a trade message', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('message', Buffer.from(JSON.stringify({
        type: 'trade',
        data: [{ s: 'tsla', p: 250.0, t: 2000 }],
      })));

      expect(service.getLastKnownPrices(['TSLA'])).toEqual([
        { symbol: 'TSLA', price: 250.0, ts: 2000 },
      ]);
    });

    it('normalises symbol to uppercase in the returned array', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('message', Buffer.from(JSON.stringify({
        type: 'trade',
        data: [{ s: 'MSFT', p: 300.0, t: 3000 }],
      })));

      const result = service.getLastKnownPrices(['msft']);
      expect(result[0].symbol).toBe('MSFT');
      expect(result[0].price).toBe(300.0);
    });
  });

  describe('onApplicationBootstrap() warm-up', () => {
    it('subscribes all distinct symbols from watchlist_items', async () => {
      const { service } = await buildService([
        { symbol: 'AAPL' },
        { symbol: 'MSFT' },
      ]);
      service.onModuleInit();
      const ws = FakeWS.lastInstance;
      ws.trigger('open');

      await service.onApplicationBootstrap();

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }));
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'MSFT' }));
    });

    it('deduplicates symbols (same symbol multiple rows)', async () => {
      const { service } = await buildService([
        { symbol: 'AAPL' },
        { symbol: 'aapl' },
      ]);
      service.onModuleInit();
      const ws = FakeWS.lastInstance;
      ws.trigger('open');

      await service.onApplicationBootstrap();

      const subscribeCalls = (ws.send as jest.Mock).mock.calls.filter(
        ([msg]: [string]) => JSON.parse(msg).type === 'subscribe',
      );
      expect(subscribeCalls).toHaveLength(1);
    });

    it('does not throw when Supabase returns an error (non-fatal)', async () => {
      const { service, supabase } = await buildService();
      supabase.client.from.mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST301' } }),
      });
      service.onModuleInit();

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });

    it('does not throw when Supabase returns null data with no error (non-fatal)', async () => {
      const { service, supabase } = await buildService();
      supabase.client.from.mockReturnValue({
        select: jest.fn().mockResolvedValue({ data: null, error: null }),
      });
      service.onModuleInit();

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });

  describe('close handler — exponential backoff', () => {
    it('reconnects after the initial delay of 1 000 ms', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('close');

      jest.advanceTimersByTime(999);
      expect(WebSocket).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(2);
    });

    it('doubles the delay on each consecutive close', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      let ws = FakeWS.lastInstance;

      ws.trigger('close');
      jest.advanceTimersByTime(1000);
      ws = FakeWS.lastInstance;
      expect(WebSocket).toHaveBeenCalledTimes(2);

      ws.trigger('close');
      jest.advanceTimersByTime(1999);
      expect(WebSocket).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(3);
    });

    it('caps the reconnect delay at 30 000 ms', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      let ws = FakeWS.lastInstance;

      for (let i = 0; i < 5; i++) {
        ws.trigger('close');
        jest.runAllTimers();
        ws = FakeWS.lastInstance;
      }

      const instancesBefore = (WebSocket as unknown as jest.Mock).mock.instances.length;

      ws.trigger('close');
      jest.advanceTimersByTime(29999);
      expect((WebSocket as unknown as jest.Mock).mock.instances.length).toBe(instancesBefore);

      jest.advanceTimersByTime(1);
      expect((WebSocket as unknown as jest.Mock).mock.instances.length).toBe(instancesBefore + 1);
    });
  });

  describe('error handler', () => {
    it('calls ws.close() which delegates reconnection to the close handler', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('error', new Error('connection refused'));

      expect(ws.close).toHaveBeenCalledTimes(1);
    });

    it('raises reconnectDelay to ≥ 60 000 ms on a 429 rate-limit error', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('error', new Error('Unexpected server response: 429'));
      // FakeWS.close() is mocked; manually trigger the close event that ws.close() would fire
      ws.trigger('close');

      // Must wait at least 60 s before reconnecting
      jest.advanceTimersByTime(59_999);
      expect(WebSocket).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(2);
    });
  });

  describe('subscribe() — reference counted', () => {
    it('sends a single WS subscribe on the 0 → 1 transition', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      service.subscribe('AAPL');
      service.subscribe('AAPL');

      expect(ws.send).toHaveBeenCalledTimes(1);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }));
    });

    it('does not send when the socket is not OPEN, but still tracks the symbol', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      FakeWS.lastInstance.readyState = WS_CONNECTING;

      service.subscribe('TSLA');

      expect(FakeWS.lastInstance.send).not.toHaveBeenCalled();

      FakeWS.lastInstance.readyState = WS_OPEN;
      FakeWS.lastInstance.trigger('open');
      expect(FakeWS.lastInstance.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'TSLA' }));
    });
  });

  describe('unsubscribe() — reference counted', () => {
    it('sends a WS unsubscribe only on the 1 → 0 transition', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      service.subscribe('MSFT');
      service.subscribe('MSFT');
      ws.send.mockClear();

      service.unsubscribe('MSFT');
      expect(ws.send).not.toHaveBeenCalled();

      service.unsubscribe('MSFT');
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'unsubscribe', symbol: 'MSFT' }));
    });

    it('is a no-op when no one ever subscribed (count already 0)', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;
      ws.send.mockClear();

      service.unsubscribe('GOOG');

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('does not send a WS unsubscribe when the socket is not OPEN', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      service.subscribe('NVDA');
      ws.send.mockClear();

      ws.readyState = WS_CONNECTING;
      service.unsubscribe('NVDA');

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('close handler — reconnecting guard', () => {
    it('does not schedule a second reconnect when close fires twice in rapid succession', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('close'); // first close: schedules reconnect, sets reconnecting=true
      const instancesAfterFirst = (WebSocket as unknown as jest.Mock).mock.instances.length;

      ws.trigger('close'); // second close: guard returns early, no second timer

      jest.advanceTimersByTime(1000); // first reconnect fires
      expect((WebSocket as unknown as jest.Mock).mock.instances.length).toBe(instancesAfterFirst + 1);

      // Only one reconnect — the guard prevented a second one
      jest.advanceTimersByTime(1000);
      expect((WebSocket as unknown as jest.Mock).mock.instances.length).toBe(instancesAfterFirst + 1);
    });
  });
});
