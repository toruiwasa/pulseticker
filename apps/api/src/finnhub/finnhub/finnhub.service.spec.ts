jest.mock('ws');
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { FinnhubService } from './finnhub.service';
import { PricesGateway } from '../../gateway/prices.gateway';
import { AlertsService } from '../../alerts/alerts/alerts.service';

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
  const gateway = { broadcastPrice: jest.fn() };
  const alerts = { checkAlerts: jest.fn() };

  const moduleRef = await Test.createTestingModule({
    providers: [
      FinnhubService,
      { provide: ConfigService, useValue: config },
      { provide: PricesGateway, useValue: gateway },
      { provide: AlertsService, useValue: alerts },
    ],
  }).compile();

  const service = moduleRef.get(FinnhubService);
  return { service, gateway, alerts };
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

      // Simulate close → timer fires → reconnect → open
      ws1.trigger('close');
      jest.advanceTimersByTime(1000);

      const ws2 = FakeWS.lastInstance;
      ws2.trigger('open');

      expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }));
    });

    it('resets reconnectDelay to 1 000 ms after a successful open', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws1 = FakeWS.lastInstance;

      // First close doubles delay to 2 000 ms
      ws1.trigger('close');
      jest.advanceTimersByTime(1000);

      // Open resets it back to 1 000 ms
      const ws2 = FakeWS.lastInstance;
      ws2.trigger('open');

      // Next close should fire at 1 000 ms again, not 2 000 ms
      ws2.trigger('close');
      jest.advanceTimersByTime(999);
      expect(WebSocket).toHaveBeenCalledTimes(2); // no third instance yet

      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(3); // reconnected at exactly 1 000 ms
    });
  });

  describe('message handler', () => {
    it('broadcasts price and checks alerts for each trade', async () => {
      const { service, gateway, alerts } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      const msg = JSON.stringify({
        type: 'trade',
        data: [{ s: 'AAPL', p: 185.5, t: 1000 }],
      });
      ws.trigger('message', Buffer.from(msg));

      expect(gateway.broadcastPrice).toHaveBeenCalledWith('AAPL', 185.5, 1000);
      expect(alerts.checkAlerts).toHaveBeenCalledWith('AAPL', 185.5);
    });

    it('ignores non-trade message types', async () => {
      const { service, gateway } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      ws.trigger('message', Buffer.from(JSON.stringify({ type: 'ping' })));

      expect(gateway.broadcastPrice).not.toHaveBeenCalled();
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
      expect(WebSocket).toHaveBeenCalledTimes(1); // not yet

      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(2); // reconnected
    });

    it('doubles the delay on each consecutive close', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      let ws = FakeWS.lastInstance;

      // 1st close: fires at 1 000 ms
      ws.trigger('close');
      jest.advanceTimersByTime(1000);
      ws = FakeWS.lastInstance;
      expect(WebSocket).toHaveBeenCalledTimes(2);

      // 2nd close: fires at 2 000 ms
      ws.trigger('close');
      jest.advanceTimersByTime(1999);
      expect(WebSocket).toHaveBeenCalledTimes(2); // not yet
      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(3); // reconnected at 2 000 ms
    });

    it('caps the reconnect delay at 30 000 ms', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      let ws = FakeWS.lastInstance;

      // Advance through 5 closes to push reconnectDelay to 30 000 ms
      // delays: 1000 → 2000 → 4000 → 8000 → 16000 → (next will be 30000)
      for (let i = 0; i < 5; i++) {
        ws.trigger('close');
        jest.runAllTimers();
        ws = FakeWS.lastInstance;
      }

      const instancesBefore = (WebSocket as unknown as jest.Mock).mock.instances.length;

      // 6th close: should fire at exactly 30 000 ms
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
  });

  describe('subscribe()', () => {
    it('sends a subscribe message when the socket is OPEN', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      FakeWS.lastInstance.readyState = WS_OPEN;

      service.subscribe('TSLA');

      expect(FakeWS.lastInstance.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'subscribe', symbol: 'TSLA' }),
      );
    });

    it('only tracks the symbol without sending when socket is not OPEN', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      FakeWS.lastInstance.readyState = WS_CONNECTING;

      service.subscribe('TSLA');

      expect(FakeWS.lastInstance.send).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe()', () => {
    it('sends an unsubscribe message when the socket is OPEN', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;
      ws.readyState = WS_OPEN;

      service.subscribe('MSFT');
      service.unsubscribe('MSFT');

      expect(ws.send).toHaveBeenLastCalledWith(
        JSON.stringify({ type: 'unsubscribe', symbol: 'MSFT' }),
      );
    });

    it('does not send when socket is not OPEN', async () => {
      const { service } = await buildService();
      service.onModuleInit();
      const ws = FakeWS.lastInstance;

      service.subscribe('MSFT');
      ws.readyState = WS_CONNECTING;
      ws.send.mockClear();

      service.unsubscribe('MSFT');

      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
