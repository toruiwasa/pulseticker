// FinnhubClient and SubscriptionRegistry are unit-tested in isolation
// (finnhub.client.spec.ts, subscription-registry.spec.ts). Neither proves the
// composed behaviour on its own: the client only proves it calls its onOpen
// callbacks, and the registry only proves it registers one and replays
// wantedSymbols() when invoked. This file wires both real classes together
// with a fake WebSocket to prove the actual reconnect-resubscribe contract —
// the single highest-risk behaviour in #74 — end to end.
jest.mock('ws');
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import WebSocket from 'ws';
import { FinnhubClient } from './finnhub.client.js';
import { SubscriptionRegistry } from './subscription-registry.js';

const WS_OPEN = 1;

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

async function buildFinnhub() {
  const config = { getOrThrow: jest.fn().mockReturnValue('test-key') };
  const eventEmitter = { emit: jest.fn() };

  const moduleRef = await Test.createTestingModule({
    providers: [
      FinnhubClient,
      SubscriptionRegistry,
      { provide: ConfigService, useValue: config },
      { provide: EventEmitter2, useValue: eventEmitter },
    ],
  }).compile();

  const client = moduleRef.get(FinnhubClient);
  const registry = moduleRef.get(SubscriptionRegistry);
  return { client, registry };
}

describe('FinnhubClient + SubscriptionRegistry — reconnect resubscribe', () => {
  it('re-subscribes a ref-counted symbol on (re)connect', async () => {
    const { client, registry } = await buildFinnhub();
    client.onModuleInit();
    const ws1 = FakeWS.lastInstance;
    ws1.trigger('open');

    registry.subscribe('AAPL');

    ws1.trigger('close');
    jest.advanceTimersByTime(1000);

    const ws2 = FakeWS.lastInstance;
    ws2.trigger('open');

    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }));
  });

  it('re-subscribes a pinned symbol through a real close/reconnect cycle', async () => {
    const { client, registry } = await buildFinnhub();
    client.onModuleInit();
    const ws1 = FakeWS.lastInstance;
    ws1.trigger('open');
    registry.ensureSubscribed('AAPL');
    (ws1.send as jest.Mock).mockClear();

    ws1.trigger('close');
    jest.advanceTimersByTime(1000);

    const ws2 = FakeWS.lastInstance;
    ws2.trigger('open');

    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }));
  });

  it('re-subscribes both pinned and ref-counted symbols together after a close/reconnect cycle', async () => {
    const { client, registry } = await buildFinnhub();
    client.onModuleInit();
    const ws1 = FakeWS.lastInstance;
    ws1.trigger('open');

    registry.ensureSubscribed('AAPL');
    registry.subscribe('MSFT');

    ws1.trigger('close');
    jest.advanceTimersByTime(1000);

    const ws2 = FakeWS.lastInstance;
    ws2.trigger('open');

    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'AAPL' }));
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'subscribe', symbol: 'MSFT' }));
    expect(ws2.send).toHaveBeenCalledTimes(2);
  });

  it('reflects a subscribe queued while CONNECTING once the socket opens', async () => {
    const { client, registry } = await buildFinnhub();
    client.onModuleInit();
    FakeWS.lastInstance.readyState = 0;

    registry.subscribe('TSLA');
    expect(FakeWS.lastInstance.send).not.toHaveBeenCalled();

    FakeWS.lastInstance.readyState = WS_OPEN;
    FakeWS.lastInstance.trigger('open');

    expect(FakeWS.lastInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'subscribe', symbol: 'TSLA' }),
    );
  });

  it('does not send a WS unsubscribe when the socket is not OPEN', async () => {
    const { client, registry } = await buildFinnhub();
    client.onModuleInit();
    const ws = FakeWS.lastInstance;

    registry.subscribe('NVDA');
    ws.send.mockClear();

    ws.readyState = 0;
    registry.unsubscribe('NVDA');

    expect(ws.send).not.toHaveBeenCalled();
  });
});
