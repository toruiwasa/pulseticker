import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';

export interface PriceTick {
  symbol: string;
  price: number;
  ts: number;
}

export interface AlertPayload {
  symbol: string;
  price: number;
  threshold: number;
  direction: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket | null = null;

  price$ = new Subject<PriceTick>();
  alert$ = new Subject<AlertPayload>();

  connect(token: string) {
    this.socket = io(`${environment.wsUrl}/prices`, {
      auth: { token },
      transports: ['websocket'],
    });
    this.socket.on('price', (data: PriceTick) => this.price$.next(data));
    this.socket.on('alert-triggered', (data: AlertPayload) => this.alert$.next(data));
  }

  subscribe(symbols: string[]) {
    this.socket?.emit('subscribe', { symbols });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}
