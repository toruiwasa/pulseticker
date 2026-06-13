import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Subscription, forkJoin } from 'rxjs';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';

export interface WatchlistItem {
  id: string;
  symbol: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class WatchlistStateService implements OnDestroy {
  private api = inject(ApiService);
  private socket = inject(SocketService);

  readonly watchlist  = signal<WatchlistItem[]>([]);
  readonly prices     = signal<Record<string, number>>({});
  readonly timestamps = signal<Record<string, Date>>({});
  readonly isLive     = signal<Record<string, boolean>>({});
  readonly loading    = signal(true);

  readonly atLimit = computed(() => this.watchlist().length >= 50);

  private loaded = false;
  private priceSub?: Subscription;

  load(session: Session): void {
    // Ensure socket reconnects if it dropped (no-op if already connected)
    this.socket.connect(session.access_token);

    if (this.loaded) return;
    this.loaded = true;

    this.api.get<WatchlistItem[]>('/watchlist').subscribe({
      next: items => {
        this.watchlist.set(items);
        this.loading.set(false);
        const symbols = items.map(i => i.symbol);

        this.socket.subscribe(symbols);

        this.priceSub = this.socket.price$.subscribe(({ symbol, price, ts }) => {
          this.prices.update(p => ({ ...p, [symbol]: price }));
          this.timestamps.update(t => ({ ...t, [symbol]: new Date(ts) }));
          this.isLive.update(l => ({ ...l, [symbol]: true }));
        });

        this.loadFallbackPrices(symbols);
      },
      error: () => this.loading.set(false),
    });
  }

  addSymbol(symbol: string): void {
    if (this.atLimit()) return;
    this.api.post<WatchlistItem>('/watchlist', { symbol }).subscribe({
      next: item => {
        this.watchlist.update(w => [...w, item]);
        this.socket.subscribe([item.symbol]);
        this.loadFallbackPrices([item.symbol]);
      },
      error: e => console.error('Failed to add symbol', e),
    });
  }

  removeSymbol(symbol: string, selectedSymbol?: string | null): boolean {
    const wasSelected = selectedSymbol === symbol;
    this.api.delete(`/watchlist/${encodeURIComponent(symbol)}`).subscribe({
      next: () => {
        this.watchlist.update(w => w.filter(i => i.symbol !== symbol));
        this.prices.update(p => { const n = { ...p }; delete n[symbol]; return n; });
        this.timestamps.update(t => { const n = { ...t }; delete n[symbol]; return n; });
        this.isLive.update(l => { const n = { ...l }; delete n[symbol]; return n; });
      },
      error: e => console.error('Failed to remove symbol', e),
    });
    return wasSelected;
  }

  ngOnDestroy(): void {
    this.priceSub?.unsubscribe();
    this.socket.disconnect();
  }

  private loadFallbackPrices(symbols: string[]): void {
    const equitySymbols = symbols.filter(s => !s.startsWith('OANDA:'));
    if (equitySymbols.length === 0) return;
    const now = new Date();

    forkJoin(
      Object.fromEntries(equitySymbols.map(s => [s, this.api.getQuote(s)])),
    ).subscribe({
      next: results => {
        this.prices.update(p => {
          const n = { ...p };
          for (const [s, d] of Object.entries(results)) {
            const c = (d as { c: number }).c;
            if (c > 0) n[s] = c;
          }
          return n;
        });
        this.timestamps.update(t => {
          const n = { ...t };
          for (const s of equitySymbols) if (!n[s]) n[s] = now;
          return n;
        });
      },
      error: e => console.error('Failed to load quotes', e),
    });
  }
}
