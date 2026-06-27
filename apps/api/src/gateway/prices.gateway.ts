import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { SecureLogger } from '../common/logger/secure-logger.js';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service.js';
import { SupabaseService } from '../supabase/supabase/supabase.service.js';

interface AlertTriggeredPayload {
  alertId: string;
  userId: string;
  symbol: string;
  price: number;
  threshold: string;
  direction: string;
  message: string;
}

@WebSocketGateway({ namespace: '/prices' })
export class PricesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new SecureLogger(PricesGateway.name);

  constructor(
    private supabase: SupabaseService,
    private finnhub: FinnhubService,
  ) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      this.logger.warn('WS rejected: missing auth token');
      client.disconnect();
      return;
    }
    const { data, error } = await this.supabase.client.auth.getUser(token);
    if (error || !data.user) {
      if (error) {
        this.logger.warnWithCause('WS rejected: token verification failed', error);
      } else {
        this.logger.warn('WS rejected: no user returned');
      }
      client.disconnect();
      return;
    }
    client.data.userId = data.user.id;
    client.data.subscribedSymbols = new Set<string>();
    client.join(`user:${data.user.id}`);
    this.logger.log(`Client connected: ${data.user.id}`);
  }

  handleDisconnect(client: Socket) {
    const syms = client.data.subscribedSymbols as Set<string> | undefined;
    if (syms) {
      for (const sym of syms) {
        this.finnhub.unsubscribe(sym);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { symbols: string[] }) {
    for (const sym of payload.symbols) {
      client.join(`symbol:${sym}`);
      this.finnhub.subscribe(sym);
      (client.data.subscribedSymbols as Set<string>).add(sym);
    }
  }

  broadcastPrice(symbol: string, price: number, ts: number) {
    this.server.to(`symbol:${symbol}`).emit('price', { symbol, price, ts });
  }

  @OnEvent('price.received')
  handlePriceReceived(payload: { symbol: string; price: number; ts: number }) {
    this.broadcastPrice(payload.symbol, payload.price, payload.ts);
  }

  @OnEvent('alert.triggered')
  handleAlertTriggered(payload: AlertTriggeredPayload) {
    this.server.to(`user:${payload.userId}`).emit('alert-triggered', payload);
  }
}
