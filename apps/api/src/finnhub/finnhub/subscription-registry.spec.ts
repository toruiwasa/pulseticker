import { Test } from '@nestjs/testing';
import { FinnhubClient } from './finnhub.client.js';
import { SubscriptionRegistry } from './subscription-registry.js';

async function buildRegistry() {
  const openListeners: Array<() => void> = [];
  const client = {
    send: jest.fn(),
    onOpen: jest.fn((cb: () => void) => openListeners.push(cb)),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [SubscriptionRegistry, { provide: FinnhubClient, useValue: client }],
  }).compile();

  const registry = moduleRef.get(SubscriptionRegistry);
  const triggerOpen = () => openListeners.forEach(cb => cb());
  return { registry, client, triggerOpen };
}

describe('SubscriptionRegistry', () => {
  describe('construction — reconnect wiring', () => {
    it('registers an onOpen callback with the client', async () => {
      const { client } = await buildRegistry();
      expect(client.onOpen).toHaveBeenCalledTimes(1);
    });

    it('replays every pinned and ref-counted symbol through client.send on open', async () => {
      const { registry, client, triggerOpen } = await buildRegistry();
      registry.ensureSubscribed('AAPL');
      registry.subscribe('MSFT');
      client.send.mockClear();

      triggerOpen();

      expect(client.send).toHaveBeenCalledWith('subscribe', 'AAPL');
      expect(client.send).toHaveBeenCalledWith('subscribe', 'MSFT');
      expect(client.send).toHaveBeenCalledTimes(2);
    });

    it('sends nothing on open when nothing is wanted', async () => {
      const { client, triggerOpen } = await buildRegistry();
      client.send.mockClear();

      triggerOpen();

      expect(client.send).not.toHaveBeenCalled();
    });
  });

  describe('subscribe() — reference counted', () => {
    it('sends a single subscribe on the 0 → 1 transition', async () => {
      const { registry, client } = await buildRegistry();

      registry.subscribe('AAPL');
      registry.subscribe('AAPL');

      expect(client.send).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledWith('subscribe', 'AAPL');
    });
  });

  describe('unsubscribe() — reference counted', () => {
    it('sends unsubscribe only on the 1 → 0 transition', async () => {
      const { registry, client } = await buildRegistry();
      registry.subscribe('MSFT');
      registry.subscribe('MSFT');
      client.send.mockClear();

      registry.unsubscribe('MSFT');
      expect(client.send).not.toHaveBeenCalled();

      registry.unsubscribe('MSFT');
      expect(client.send).toHaveBeenCalledWith('unsubscribe', 'MSFT');
    });

    it('is a no-op when no one ever subscribed (count already 0)', async () => {
      const { registry, client } = await buildRegistry();

      registry.unsubscribe('GOOG');

      expect(client.send).not.toHaveBeenCalled();
    });
  });

  describe('ensureSubscribed() — pinned, idempotent, capped', () => {
    it('subscribes upstream once no matter how many times it is called', async () => {
      const { registry, client } = await buildRegistry();

      expect(registry.ensureSubscribed('AAPL')).toBe(true);
      expect(registry.ensureSubscribed('AAPL')).toBe(true);
      expect(registry.ensureSubscribed('aapl')).toBe(true);

      expect(client.send).toHaveBeenCalledTimes(1);
      expect(registry.liveSubscriptionCount()).toBe(1);
    });

    it('pins an already ref-counted symbol without re-sending upstream', async () => {
      const { registry, client } = await buildRegistry();
      registry.subscribe('AAPL'); // a connected web client already made it live
      client.send.mockClear();

      expect(registry.ensureSubscribed('AAPL')).toBe(true);

      // Already live upstream via the ref count — a second subscribe frame
      // for the same symbol would be redundant, not harmful, but the pin
      // must still take effect so it survives that client's disconnect.
      expect(client.send).not.toHaveBeenCalled();
      registry.unsubscribe('AAPL');
      expect(client.send).not.toHaveBeenCalledWith('unsubscribe', 'AAPL');
    });

    it('keeps the symbol live after every client disconnects', async () => {
      const { registry, client } = await buildRegistry();
      registry.ensureSubscribed('AAPL');
      registry.subscribe('AAPL');
      client.send.mockClear();

      registry.unsubscribe('AAPL');

      // This is the defect the pin exists for: mobile polls REST and never
      // opens a socket, so a symbol released here would read price: null.
      expect(client.send).not.toHaveBeenCalled();
      expect(registry.liveSubscriptionCount()).toBe(1);
    });

    it('refuses past the 50-symbol cap and reports the refusal', async () => {
      const { registry } = await buildRegistry();

      for (let i = 0; i < 50; i++) registry.ensureSubscribed(`SYM${i}`);

      expect(registry.liveSubscriptionCount()).toBe(50);
      expect(registry.ensureSubscribed('OVERFLOW')).toBe(false);
      expect(registry.liveSubscriptionCount()).toBe(50);
    });

    it('still accepts a symbol already subscribed once the cap is reached', async () => {
      const { registry } = await buildRegistry();
      for (let i = 0; i < 50; i++) registry.ensureSubscribed(`SYM${i}`);

      expect(registry.ensureSubscribed('SYM0')).toBe(true);
    });

    it('refuses a client subscribe past the cap without tracking it', async () => {
      const { registry } = await buildRegistry();
      for (let i = 0; i < 50; i++) registry.ensureSubscribed(`SYM${i}`);

      registry.subscribe('OVERFLOW');

      expect(registry.liveSubscriptionCount()).toBe(50);
    });
  });

  describe('cap refusal logging', () => {
    it('warns once per refused symbol, not once per polling attempt', async () => {
      const { registry } = await buildRegistry();
      for (let i = 0; i < 50; i++) registry.ensureSubscribed(`SYM${i}`);
      const warnData = jest.spyOn(
        (registry as unknown as { logger: { warnData: (...a: unknown[]) => void } }).logger,
        'warnData',
      );

      // The 15 s price poll retries a refused symbol on every tick.
      registry.ensureSubscribed('REFUSED');
      registry.ensureSubscribed('REFUSED');
      registry.ensureSubscribed('REFUSED');

      expect(warnData).toHaveBeenCalledTimes(1);
    });

    it('warns again if the symbol is refused anew after having recovered', async () => {
      const { registry } = await buildRegistry();
      for (let i = 0; i < 50; i++) registry.ensureSubscribed(`SYM${i}`);
      const warnData = jest.spyOn(
        (registry as unknown as { logger: { warnData: (...a: unknown[]) => void } }).logger,
        'warnData',
      );

      registry.ensureSubscribed('REFUSED'); // logged
      registry.releasePin('SYM0'); // capacity frees
      expect(registry.ensureSubscribed('REFUSED')).toBe(true); // recovers, clears the marker
      registry.releasePin('REFUSED');
      registry.ensureSubscribed('AGAIN0'); // cap full again (49 + 1)
      registry.ensureSubscribed('REFUSED'); // a new refusal episode

      expect(warnData).toHaveBeenCalledTimes(2);
    });
  });

  describe('releasePin()', () => {
    it('unsubscribes upstream when no client wants the symbol', async () => {
      const { registry, client } = await buildRegistry();
      registry.ensureSubscribed('AAPL');
      client.send.mockClear();

      registry.releasePin('AAPL');

      expect(client.send).toHaveBeenCalledWith('unsubscribe', 'AAPL');
      expect(registry.liveSubscriptionCount()).toBe(0);
    });

    it('keeps the symbol live when a client still wants it', async () => {
      const { registry, client } = await buildRegistry();
      registry.ensureSubscribed('AAPL');
      registry.subscribe('AAPL');
      client.send.mockClear();

      registry.releasePin('AAPL');

      expect(client.send).not.toHaveBeenCalled();
      expect(registry.liveSubscriptionCount()).toBe(1);
    });

    it('is a no-op for a symbol that was never pinned', async () => {
      const { registry, client } = await buildRegistry();

      registry.releasePin('NEVER');

      expect(client.send).not.toHaveBeenCalled();
    });
  });
});
