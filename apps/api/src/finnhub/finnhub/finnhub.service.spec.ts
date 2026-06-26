jest.mock('ws');
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import { FinnhubService } from './finnhub.service.js';

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

async function buildService() {
  const config = { getOrThrow: jest.fn().mockReturnValue('test-key') };
  const eventEmitter = { emit: jest.fn() };

  const moduleRef = await Test.createTestingModule({
    providers: [
      FinnhubService,
      { provide: ConfigService, useValue: config },
      { provide: EventEmitter2, useValue: eventEmitter },
    ],
  }).compile();

  const service = moduleRef.get(FinnhubService);
  return { service, eventEmitter };
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
  });
});
