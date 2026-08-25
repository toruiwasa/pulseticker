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
import { SubscriptionRegistry } from '../finnhub/finnhub/subscription-registry.js';
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

/** What this gateway stores on Socket.io's untyped `client.data` bag. */
interface ClientState {
  userId?: string;
  subscribedSymbols?: Set<string>;
}

@WebSocketGateway({ namespace: '/prices' })
export class PricesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new SecureLogger(PricesGateway.name);

  constructor(
    private supabase: SupabaseService,
    private subscriptions: SubscriptionRegistry,
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
    const state = client.data as ClientState;
    state.userId = data.user.id;
    state.subscribedSymbols = new Set<string>();
    void client.join(`user:${data.user.id}`);
    this.logger.log(`Client connected: ${data.user.id}`);
  }

  handleDisconnect(client: Socket) {
    const syms = (client.data as ClientState).subscribedSymbols;
    if (syms) {
      for (const sym of syms) {
        this.subscriptions.unsubscribe(sym);
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { symbols: string[] }) {
    const state = client.data as ClientState;
    for (const sym of payload.symbols) {
      // A symbol the cap refused must not join the room: the client would sit
      // in a room no price is ever broadcast to, believing it subscribed.
      if (!this.subscriptions.subscribe(sym)) continue;
      void client.join(`symbol:${sym}`);
      state.subscribedSymbols?.add(sym);
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
