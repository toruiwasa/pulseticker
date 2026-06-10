import { Test } from '@nestjs/testing';
import { Socket } from 'socket.io';
import { PricesGateway } from './prices.gateway';
import { SupabaseService } from '../supabase/supabase/supabase.service';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service';

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
        { provide: FinnhubService, useValue: { subscribe: jest.fn() } },
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

    it('disconnects when the token is invalid', async () => {
      supabase.client.auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
      const client = makeSocket('bad-token');
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins user:<id> room when the token is valid', async () => {
      supabase.client.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
      const client = makeSocket('good-token');
      await gateway.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('user:u1');
      expect(client.data.userId).toBe('u1');
    });
  });

  describe('handleSubscribe', () => {
    it('joins each symbol room and forwards to FinnhubService', () => {
      const client = makeSocket();
      gateway.handleSubscribe(client, { symbols: ['AAPL', 'GOOG'] });
      expect(client.join).toHaveBeenCalledWith('symbol:AAPL');
      expect(client.join).toHaveBeenCalledWith('symbol:GOOG');
      expect(finnhub.subscribe).toHaveBeenCalledWith('AAPL');
      expect(finnhub.subscribe).toHaveBeenCalledWith('GOOG');
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
