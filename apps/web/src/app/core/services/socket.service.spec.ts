import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SocketService, PriceTick, AlertPayload } from './socket.service';

// vi.mock is hoisted before variable declarations; vi.hoisted() lets us
// create the mock reference early enough for the factory to close over it.
const mockIo = vi.hoisted(() => vi.fn());

vi.mock('socket.io-client', () => ({ io: mockIo }));

class MockSocket {
  static last: MockSocket;
  private listeners: Record<string, (data: unknown) => void> = {};
  emit = vi.fn();
  disconnect = vi.fn();

  constructor() {
    MockSocket.last = this;
  }

  on(event: string, cb: (d: unknown) => void) {
    this.listeners[event] = cb;
  }

  trigger(event: string, data: unknown) {
    this.listeners[event]?.(data);
  }
}

describe('SocketService', () => {
  let service: SocketService;

  beforeEach(() => {
    mockIo.mockImplementation(() => new MockSocket());
    mockIo.mockClear();
    TestBed.configureTestingModule({ providers: [SocketService] });
    service = TestBed.inject(SocketService);
  });

  describe('connect()', () => {
    it('calls io with the correct URL, auth token, and reconnection options', () => {
      service.connect('tok-123');

      expect(mockIo).toHaveBeenCalledOnce();
      const [url, opts] = mockIo.mock.calls[0] as unknown as [string, Record<string, unknown>];
      expect(url).toMatch(/\/prices$/);
      expect(opts).toMatchObject({
        auth: { token: 'tok-123' },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 30000,
        reconnectionAttempts: Infinity,
      });
    });
  });

  describe('price$ stream', () => {
    it('emits a PriceTick when the price event fires', () => {
      service.connect('t');
      const tick: PriceTick = { symbol: 'AAPL', price: 185.5, ts: 1000 };
      const received: PriceTick[] = [];
      const sub = service.price$.subscribe(p => received.push(p));

      MockSocket.last.trigger('price', tick);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(tick);
      sub.unsubscribe();
    });
  });

  describe('alert$ stream', () => {
    it('emits an AlertPayload when the alert-triggered event fires', () => {
      service.connect('t');
      const payload: AlertPayload = {
        symbol: 'TSLA', price: 250, threshold: 240,
        direction: 'above', message: 'TSLA hit 250',
      };
      const received: AlertPayload[] = [];
      const sub = service.alert$.subscribe(a => received.push(a));

      MockSocket.last.trigger('alert-triggered', payload);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(payload);
      sub.unsubscribe();
    });
  });

  describe('subscribe()', () => {
    it('emits the subscribe event with the given symbols', () => {
      service.connect('t');
      service.subscribe(['AAPL', 'GOOG']);
      expect(MockSocket.last.emit).toHaveBeenCalledWith('subscribe', { symbols: ['AAPL', 'GOOG'] });
    });

    it('is a no-op when socket is null (before connect)', () => {
      expect(() => service.subscribe(['AAPL'])).not.toThrow();
    });
  });

  describe('disconnect()', () => {
    it('calls socket.disconnect() and clears the socket', () => {
      service.connect('t');
      const sock = MockSocket.last;
      service.disconnect();

      expect(sock.disconnect).toHaveBeenCalledOnce();
    });

    it('subsequent subscribe() is a no-op after disconnect', () => {
      service.connect('t');
      const sock = MockSocket.last;
      service.disconnect();

      expect(() => service.subscribe(['AAPL'])).not.toThrow();
      expect(sock.emit).not.toHaveBeenCalled();
    });
  });
});
