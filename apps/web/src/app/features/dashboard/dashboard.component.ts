import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, filter, forkJoin, take } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';
import { AlertPayload, SocketService } from '../../core/services/socket.service';
import { isMarketOpen } from '../../core/constants/market-holidays';
import { OandaPipe } from '../../core/pipes/oanda.pipe';
import { SymbolSearchInputComponent } from '../../core/components/symbol-search-input.component';
import { PriceChartComponent } from './price-chart/price-chart.component';

interface WatchlistItem {
  id: string;
  symbol: string;
  created_at: string;
}

@Component({
  standalone: true,
  imports: [DatePipe, RouterLink, OandaPipe, SymbolSearchInputComponent, PriceChartComponent],
  template: `
    <div style="padding: 2rem">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h1>Dashboard</h1>
        <div style="display:flex;align-items:center;gap:1rem">
          @if (marketOpen()) {
            <span style="color:#16a34a;font-weight:600">● LIVE</span>
          } @else {
            <span style="color:#999">○ Market Closed</span>
          }
          <a routerLink="/alerts">Manage Alerts</a>
        </div>
      </div>

      @if (toast()) {
        <div style="background:#fef3c7;border:1px solid #d97706;padding:0.75rem 1rem;margin-bottom:1rem;border-radius:4px">
          {{ toast()!.message }}
        </div>
      }

      @if (!loading()) {
        <div style="margin:1rem 0;display:flex;align-items:center;gap:1rem">
          <span>{{ watchlistCount() }} / 50 symbols</span>
          <app-symbol-search
            clearOnSelect
            placeholder="Search symbols…"
            [disabled]="atLimit()"
            (symbolSelected)="addSymbol($event)"
            style="flex:1;max-width:360px"
          />
        </div>
      }

      @if (loading()) {
        <p>Loading…</p>
      } @else if (watchlist().length === 0) {
        <p>No symbols yet. Use the search above to add some.</p>
      } @else {
        <div class="dash-grid">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="text-align:left;border-bottom:1px solid #ddd">
                <th style="padding:0.5rem">Symbol</th>
                <th style="padding:0.5rem">Price</th>
                <th style="padding:0.5rem">Last updated</th>
                <th style="padding:0.5rem"></th>
              </tr>
            </thead>
            <tbody>
              @for (item of watchlist(); track item.id) {
                <tr
                  [style.color]="isLive()[item.symbol] ? 'inherit' : '#999'"
                  [style.background]="selectedSymbol() === item.symbol ? 'rgba(34,197,94,0.08)' : 'transparent'"
                  style="border-bottom:1px solid #f0f0f0;cursor:pointer"
                  (click)="selectSymbol(item.symbol)"
                >
                  <td style="padding:0.5rem">{{ item.symbol | oanda }}</td>
                  <td style="padding:0.5rem">{{ prices()[item.symbol] ?? '—' }}</td>
                  <td style="padding:0.5rem">
                    @if (isLive()[item.symbol]) {
                      {{ timestamps()[item.symbol] | date:'HH:mm:ss' }}
                    } @else if (prices()[item.symbol] && timestamps()[item.symbol]) {
                      Last: {{ timestamps()[item.symbol] | date:'MMM d, HH:mm' }} EST
                    } @else {
                      —
                    }
                  </td>
                  <td style="padding:0.5rem">
                    <button type="button" (click)="removeSymbol(item.symbol); $event.stopPropagation()" style="background:transparent;border:none;cursor:pointer;font-size:1rem">×</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <app-price-chart [symbol]="selectedSymbol()" />
        </div>
      }
    </div>
  `,
  styles: [`
    .dash-grid {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) 2fr;
      gap: 1.5rem;
      align-items: start;
    }
    @media (max-width: 768px) {
      .dash-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  loading = signal(true);
  watchlist = signal<WatchlistItem[]>([]);
  prices = signal<Record<string, number>>({});
  timestamps = signal<Record<string, Date>>({});
  toast = signal<AlertPayload | null>(null);

  isLive = signal<Record<string, boolean>>({});
  marketOpen = signal(isMarketOpen());
  selectedSymbol = signal<string | null>(null);

  watchlistCount = computed(() => this.watchlist().length);
  atLimit = computed(() => this.watchlistCount() >= 50);

  private priceSub?: Subscription;
  private alertSub?: Subscription;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private marketTimer?: ReturnType<typeof setInterval>;

  constructor(
    private auth: AuthService,
    private api: ApiService,
    private socket: SocketService,
  ) {}

  ngOnInit() {
    this.marketTimer = setInterval(() => this.marketOpen.set(isMarketOpen()), 30_000);

    this.auth.session$.pipe(filter(Boolean), take(1)).subscribe(session => {
      this.api.get<WatchlistItem[]>('/watchlist').subscribe({
        next: watchlist => {
          this.watchlist.set(watchlist);
          this.loading.set(false);
          const symbols = watchlist.map(i => i.symbol);

          this.socket.connect(session.access_token);
          this.socket.subscribe(symbols);

          this.priceSub = this.socket.price$.subscribe(({ symbol, price, ts }) => {
            this.prices.update(p => ({ ...p, [symbol]: price }));
            this.timestamps.update(t => ({ ...t, [symbol]: new Date(ts) }));
            this.isLive.update(l => ({ ...l, [symbol]: true }));
          });

          this.alertSub = this.socket.alert$.subscribe(data => {
            this.toast.set(data);
            clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => this.toast.set(null), 5000);
          });

          this.loadFallbackPrices(symbols);
        },
        error: e => { console.error('Failed to load watchlist', e); this.loading.set(false); },
      });
    });
  }

  ngOnDestroy() {
    this.priceSub?.unsubscribe();
    this.alertSub?.unsubscribe();
    clearTimeout(this.toastTimer);
    clearInterval(this.marketTimer);
    this.socket.disconnect();
  }

  addSymbol(symbol: string) {
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

  selectSymbol(symbol: string) {
    this.selectedSymbol.set(symbol);
  }

  removeSymbol(symbol: string) {
    if (this.selectedSymbol() === symbol) this.selectedSymbol.set(null);
    this.api.delete(`/watchlist/${encodeURIComponent(symbol)}`).subscribe({
      next: () => {
        this.watchlist.update(w => w.filter(i => i.symbol !== symbol));
        this.prices.update(p => { const n = { ...p }; delete n[symbol]; return n; });
        this.timestamps.update(t => { const n = { ...t }; delete n[symbol]; return n; });
        this.isLive.update(l => { const n = { ...l }; delete n[symbol]; return n; });
      },
      error: e => console.error('Failed to remove symbol', e),
    });
  }

  private loadFallbackPrices(symbols: string[]) {
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
