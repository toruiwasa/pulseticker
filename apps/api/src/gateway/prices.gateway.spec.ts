import { Test } from '@nestjs/testing';
import { Socket } from 'socket.io';
import { PricesGateway } from './prices.gateway.js';
import { SupabaseService } from '../supabase/supabase/supabase.service.js';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service.js';

function makeSocket(token?: string): jest.Mocked<Socket> {
  return {
    handshake: { auth: token ? { token } : {} },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
    join: jest.fn(),
  } as unknown as jest.Mocked<Socket>;
}

describe('PricesGateway', () => {
  let gateway: PricesGateway;
  let supabase: { client: { auth: { getUser: jest.Mock } } };
  let finnhub: jest.Mocked<FinnhubService>;

  beforeEach(async () => {
    supabase = { client: { auth: { getUser: jest.fn() } } };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PricesGateway,
        { provide: SupabaseService, useValue: supabase },
        { provide: FinnhubService, useValue: { subscribe: jest.fn(), unsubscribe: jest.fn() } },
      ],
    }).compile();
    gateway = moduleRef.get(PricesGateway);
    finnhub = moduleRef.get(FinnhubService);
  });

  describe('handleConnection', () => {
    it('disconnects when no token is provided', async () => {
      const client = makeSocket();
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when the token is invalid (error returned)', async () => {
      supabase.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
      const client = makeSocket('bad-token');
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when user is null and no error is returned', async () => {
      supabase.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      const client = makeSocket('stale-token');
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins user:<id> room and initialises subscribedSymbols when the token is valid', async () => {
      supabase.client.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
      const client = makeSocket('good-token');
      await gateway.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('user:u1');
      expect(client.data.userId).toBe('u1');
      expect(client.data.subscribedSymbols).toBeInstanceOf(Set);
      expect((client.data.subscribedSymbols as Set<string>).size).toBe(0);
    });
  });

  describe('handleSubscribe', () => {
    it('joins each symbol room, forwards to FinnhubService, and tracks symbols', () => {
      const client = makeSocket();
      client.data.subscribedSymbols = new Set<string>();
      gateway.handleSubscribe(client, { symbols: ['AAPL', 'GOOG'] });
      expect(client.join).toHaveBeenCalledWith('symbol:AAPL');
      expect(client.join).toHaveBeenCalledWith('symbol:GOOG');
      expect(finnhub.subscribe).toHaveBeenCalledWith('AAPL');
      expect(finnhub.subscribe).toHaveBeenCalledWith('GOOG');
      expect(client.data.subscribedSymbols as Set<string>).toContain('AAPL');
      expect(client.data.subscribedSymbols as Set<string>).toContain('GOOG');
    });
  });

  describe('handleDisconnect', () => {
    it('calls unsubscribe for each tracked symbol', () => {
      const client = makeSocket();
      client.data.subscribedSymbols = new Set(['AAPL', 'GOOG']);
      gateway.handleDisconnect(client);
      expect(finnhub.unsubscribe).toHaveBeenCalledWith('AAPL');
      expect(finnhub.unsubscribe).toHaveBeenCalledWith('GOOG');
      expect(finnhub.unsubscribe).toHaveBeenCalledTimes(2);
    });

    it('does not throw when subscribedSymbols is undefined', () => {
      const client = makeSocket();
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
      expect(finnhub.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('handlePriceReceived', () => {
    it('broadcasts the price to the symbol room', () => {
      const emitFn = jest.fn();
      const toFn = jest.fn(() => ({ emit: emitFn }));
      (gateway as unknown as { server: unknown }).server = { to: toFn };
      gateway.handlePriceReceived({ symbol: 'AAPL', price: 185.5, ts: 1000 });
      expect(toFn).toHaveBeenCalledWith('symbol:AAPL');
      expect(emitFn).toHaveBeenCalledWith('price', { symbol: 'AAPL', price: 185.5, ts: 1000 });
    });
  });

  describe('handleAlertTriggered', () => {
    it('emits alert-triggered to the user room', () => {
      const emitFn = jest.fn();
      const toFn = jest.fn(() => ({ emit: emitFn }));
      (gateway as unknown as { server: unknown }).server = { to: toFn };
      const payload = {
        alertId: 'a1', userId: 'u1', symbol: 'AAPL',
        price: 210, threshold: '200', direction: 'above', message: 'AAPL hit 210',
      };
      gateway.handleAlertTriggered(payload);
      expect(toFn).toHaveBeenCalledWith('user:u1');
      expect(emitFn).toHaveBeenCalledWith('alert-triggered', payload);
    });
  });
});
