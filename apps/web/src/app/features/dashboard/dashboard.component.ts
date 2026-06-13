import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, filter, take } from 'rxjs';
import { TuiNotificationService } from '@taiga-ui/core';
import { AuthService } from '../../core/services/auth.service';
import { SocketService } from '../../core/services/socket.service';
import { WatchlistStateService } from '../../core/services/watchlist-state.service';
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
  ],
  template: `
    @if (wl.loading()) {
      <div class="loading-state">Loading watchlist…</div>
    } @else {
      <div class="dashboard-layout">
        <aside class="watchlist-aside">
          <app-watchlist-panel
            [watchlist]="wl.watchlist()"
            [prices]="wl.prices()"
            [timestamps]="wl.timestamps()"
            [isLive]="wl.isLive()"
            [activeSymbol]="activeSymbol()"
            [atLimit]="wl.atLimit()"
            (symbolSelected)="selectSymbol($event)"
            (symbolAdded)="wl.addSymbol($event)"
            (symbolRemoved)="onRemoveSymbol($event)"
          />
        </aside>

        <div class="chart-area">
          <app-chart-header
            [symbol]="activeSymbol()"
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
    }

    .chart-body {
      height: clamp(240px, 40vh, 380px);
      flex-shrink: 0;
    }

    @media (max-width: 1199px) {
      .dashboard-layout {
        grid-template-columns: 1fr;
      }
      .watchlist-aside {
        display: none;
      }
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  protected wl = inject(WatchlistStateService);
  private auth = inject(AuthService);
  private socket = inject(SocketService);
  private route = inject(ActivatedRoute);
  private notifications = inject(TuiNotificationService);

  selectedSymbol = signal<string | null>(null);
  range = signal<ChartRange>('1D');

  activeSymbol = computed(() => this.selectedSymbol() ?? this.wl.watchlist()[0]?.symbol ?? null);
  currentPrice = computed(() => {
    const sym = this.activeSymbol();
    return sym ? (this.wl.prices()[sym] ?? null) : null;
  });

  private alertSub?: Subscription;

  ngOnInit() {
    // Pre-select symbol passed from mobile /watchlist navigation
    const sym = this.route.snapshot.queryParamMap.get('symbol');
    if (sym) this.selectedSymbol.set(sym);

    this.auth.session$.pipe(filter(Boolean), take(1)).subscribe(session => {
      this.wl.load(session);

      this.alertSub = this.socket.alert$.subscribe(payload => {
        this.notifications.open(payload.message, { label: 'Alert triggered' }).subscribe();
      });
    });
  }

  ngOnDestroy() {
    this.alertSub?.unsubscribe();
  }

  selectSymbol(symbol: string) {
    this.selectedSymbol.set(symbol);
  }

  onRemoveSymbol(symbol: string) {
    const wasSelected = this.wl.removeSymbol(symbol, this.selectedSymbol());
    if (wasSelected) this.selectedSymbol.set(null);
  }
}
