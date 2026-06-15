import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { IconComponent } from '../../core/components/svg-icon.component';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { TuiNotificationService } from '@taiga-ui/core';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { WatchlistStateService } from '../../core/services/watchlist-state.service';
import { SymbolMetadataService } from '../../core/services/symbol-metadata.service';
import { ChartRange } from '../../core/services/api.service';
import { WatchlistPanelComponent } from './watchlist-panel/watchlist-panel.component';
import { ChartHeaderComponent } from './chart-header/chart-header.component';
import { PriceChartComponent } from './price-chart/price-chart.component';
import { StatsBarComponent } from './stats-bar/stats-bar.component';
import { ContextAccordionComponent } from './context-accordion/context-accordion.component';

@Component({
  standalone: true,
  imports: [
    WatchlistPanelComponent,
    ChartHeaderComponent,
    PriceChartComponent,
    StatsBarComponent,
    ContextAccordionComponent,
    IconComponent,
  ],
  template: `
    @if (wl.loading()) {
      <div class="loading-state">Loading watchlist…</div>
    } @else {
      <div class="dashboard-layout">
        <div
          class="backdrop"
          [class.open]="watchlistOpen()"
          (click)="watchlistOpen.set(false)"
          aria-hidden="true"
        ></div>

        <aside class="watchlist-aside" [class.open]="watchlistOpen()">
          <app-watchlist-panel
            [watchlist]="wl.watchlist()"
            [prices]="wl.prices()"
            [timestamps]="wl.timestamps()"
            [isLive]="wl.isLive()"
            [currencies]="meta.currencies()"
            [activeSymbol]="activeSymbol()"
            [atLimit]="wl.atLimit()"
            (symbolSelected)="selectSymbol($event)"
            (symbolAdded)="wl.addSymbol($event)"
            (symbolRemoved)="onRemoveSymbol($event)"
          />
        </aside>

        <div class="chart-area">
          <button
            class="watchlist-toggle"
            (click)="watchlistOpen.update(v => !v)"
            [attr.aria-label]="watchlistOpen() ? 'Close watchlist' : 'Open watchlist'"
          >
            <app-icon name="list" size="16" />
            <span>{{ watchlistOpen() ? 'Hide list' : 'Watchlist' }}</span>
          </button>

          <app-chart-header
            [symbol]="activeSymbol()"
            [price]="currentPrice()"
            [currency]="activeSymbol() ? meta.currencies()[activeSymbol()!] ?? null : null"
            [activeRange]="range()"
            (rangeChange)="range.set($event)"
          />
          <app-price-chart
            class="chart-body"
            [symbol]="activeSymbol()"
            [range]="range()"
          />
          <app-stats-bar
            [symbol]="activeSymbol()"
            [currentPrice]="currentPrice()"
          />
          <app-context-accordion [symbol]="activeSymbol()" />
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--pt-text-muted);
      font-size: 0.9rem;
    }

    .dashboard-layout {
      display: grid;
      grid-template-columns: var(--pt-watchlist-w) 1fr;
      min-height: 100%;
      align-items: start;
    }

    .watchlist-aside {
      border-right: 1px solid var(--pt-border);
      background: var(--pt-bg-surface);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    .chart-area {
      display: flex;
      flex-direction: column;
      background: var(--pt-bg-base);
      min-width: 0;
      overflow-x: hidden;
    }

    .chart-body {
      height: clamp(240px, 40vh, 380px);
      flex-shrink: 0;
    }

    /* Toggle button — hidden on mobile + desktop, shown only on tablet */
    .watchlist-toggle {
      display: none;
      align-items: center;
      gap: 0.4rem;
      padding: 0.35rem 0.75rem;
      background: var(--pt-bg-elevated);
      border: 1px solid var(--pt-border);
      border-radius: 6px;
      color: var(--pt-text-secondary);
      font-size: 0.8rem;
      cursor: pointer;
      margin: 0.5rem 0.75rem;
      width: fit-content;
      transition: color 0.15s;
    }
    .watchlist-toggle:hover { color: var(--pt-primary); }

    /* Backdrop element — hidden until open */
    .backdrop {
      display: none;
      position: absolute;
      inset: 0;
      background: transparent;
      pointer-events: none;
      z-index: 49;
      transition: background 0.22s;
    }

    /* Tablet: 768–1199px — slide-in drawer */
    @media (min-width: 768px) and (max-width: 1199px) {
      .dashboard-layout {
        grid-template-columns: 1fr;
        position: relative;
        overflow: hidden;
      }

      .watchlist-aside {
        display: flex;
        position: absolute;
        left: 0;
        top: 0;
        width: var(--pt-watchlist-w);
        height: 100%;
        transform: translateX(-100%);
        transition: transform 0.22s ease;
        z-index: 50;
        box-shadow: 4px 0 20px rgba(0, 0, 0, 0.18);
        min-height: unset;
      }

      .watchlist-aside.open { transform: translateX(0); }

      .backdrop { display: block; }

      .backdrop.open {
        background: rgba(0, 0, 0, 0.3);
        pointer-events: auto;
      }

      .watchlist-toggle { display: flex; }
    }

    /* Mobile: aside hidden, /watchlist route used */
    @media (max-width: 767px) {
      .dashboard-layout { grid-template-columns: 1fr; }
      .watchlist-aside { display: none; }
      .watchlist-toggle { display: none; }
      .backdrop { display: none; }
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  protected wl = inject(WatchlistStateService);
  protected meta = inject(SymbolMetadataService);
  private auth = inject(AuthService);
  private socket = inject(SocketService);
  private route = inject(ActivatedRoute);
  private notifications = inject(TuiNotificationService);

  selectedSymbol = signal<string | null>(null);
  range = signal<ChartRange>('1D');
  protected watchlistOpen = signal(false);

  activeSymbol = computed(() => this.selectedSymbol() ?? this.wl.watchlist()[0]?.symbol ?? null);
  currentPrice = computed(() => {
    const sym = this.activeSymbol();
    return sym ? (this.wl.prices()[sym] ?? null) : null;
  });

  private alertSub?: Subscription;

  constructor() {
    effect(() => {
      const session = this.auth.session();
      if (session) {
        this.wl.load(session);

        if (!this.alertSub) {
          this.alertSub = this.socket.alert$.subscribe(payload => {
            this.notifications.open(payload.message, { label: 'Alert triggered' }).subscribe();
          });
        }
      }
    });

    effect(() => {
      for (const item of this.wl.watchlist()) {
        this.meta.ensureCurrency(item.symbol);
      }
    });
  }

  ngOnInit() {
    // Pre-select symbol passed from mobile /watchlist navigation
    const sym = this.route.snapshot.queryParamMap.get('symbol');
    if (sym) this.selectedSymbol.set(sym);
  }

  ngOnDestroy() {
    this.alertSub?.unsubscribe();
  }

  selectSymbol(symbol: string) {
    this.selectedSymbol.set(symbol);
    this.watchlistOpen.set(false);
  }

  onRemoveSymbol(symbol: string) {
    const wasSelected = this.wl.removeSymbol(symbol, this.selectedSymbol());
    if (wasSelected) this.selectedSymbol.set(null);
  }
}
