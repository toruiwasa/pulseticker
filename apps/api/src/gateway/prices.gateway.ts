import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { forwardRef, Inject } from '@nestjs/common';
import { SecureLogger } from '../common/logger/secure-logger';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service';
import { SupabaseService } from '../supabase/supabase/supabase.service';

interface AlertTriggeredPayload {
  alertId: string;
  userId: string;
  symbol: string;
  price: number;
  threshold: string;
  direction: string;
  message: string;
}

@WebSocketGateway({ cors: { origin: process.env.CORS_ORIGIN }, namespace: '/prices' })
export class PricesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new SecureLogger(PricesGateway.name);

  constructor(
    private supabase: SupabaseService,
    @Inject(forwardRef(() => FinnhubService)) private finnhub: FinnhubService,
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
    client.join(`user:${data.user.id}`);
    this.logger.log(`Client connected: ${data.user.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { symbols: string[] }) {
    for (const sym of payload.symbols) {
      client.join(`symbol:${sym}`);
      this.finnhub.subscribe(sym);
    }
  }

  broadcastPrice(symbol: string, price: number, ts: number) {
    this.server.to(`symbol:${symbol}`).emit('price', { symbol, price, ts });
  }

  @OnEvent('alert.triggered')
  handleAlertTriggered(payload: AlertTriggeredPayload) {
    this.server.to(`user:${payload.userId}`).emit('alert-triggered', payload);
  }
}
