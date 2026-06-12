import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
} from '@angular/core';
import { Subscription, filter } from 'rxjs';
import {
  IChartApi,
  ISeriesApi,
  LineSeries,
  Time,
  createChart,
} from 'lightweight-charts';
import { ApiService, CandlePoint } from '../../../core/services/api.service';
import { SocketService } from '../../../core/services/socket.service';

const GREEN = '#22c55e';
const RED = '#ef4444';

@Component({
  standalone: true,
  selector: 'app-price-chart',
  template: `
    <div class="chart-shell">
      <div class="chart-header">
        @if (symbol()) {
          <span class="symbol">{{ symbol() }}</span>
        } @else {
          <span class="placeholder">Select a symbol to view chart</span>
        }
      </div>
      <div #host class="chart-container"></div>
    </div>
  `,
  styles: [
    `
      .chart-shell {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
      }
      .chart-header {
        font-weight: 600;
        color: #d1d5db;
        min-height: 1.25rem;
      }
      .placeholder {
        color: #9ca3af;
        font-weight: 400;
      }
      .chart-container {
        width: 100%;
        max-width: 900px;
        height: 400px;
      }
      @media (max-width: 768px) {
        .chart-container {
          height: 200px;
        }
      }
    `,
  ],
})
export class PriceChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  readonly symbol = input<string | null>(null);

  private api = inject(ApiService);
  private socket = inject(SocketService);

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Line'> | null = null;
  private tickSub: Subscription | null = null;
  private basePrice: number | null = null;
  private lastTime: number | null = null;

  constructor() {
    effect(() => {
      const sym = this.symbol();
      if (!this.series) return;
      this.loadSymbol(sym);
    });
  }

  ngAfterViewInit() {
    this.chart = createChart(this.host.nativeElement, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
    });
    this.series = this.chart.addSeries(LineSeries, { color: GREEN });

    const sym = this.symbol();
    if (sym) this.loadSymbol(sym);
  }

  ngOnDestroy() {
    this.tickSub?.unsubscribe();
    this.tickSub = null;
    this.chart?.remove();
    this.chart = null;
    this.series = null;
  }

  private loadSymbol(sym: string | null) {
    this.tickSub?.unsubscribe();
    this.tickSub = null;
    this.basePrice = null;
    this.lastTime = null;
    if (this.series) this.series.setData([]);

    if (!sym) return;

    this.api.getCandles(sym).subscribe({
      next: candles => this.applyHistory(candles),
      error: () => this.applyHistory([]),
    });

    this.tickSub = this.socket.price$
      .pipe(filter(t => t.symbol === sym))
      .subscribe(tick => this.onTick(tick.price, tick.ts));
  }

  private applyHistory(candles: CandlePoint[]) {
    if (!this.series) return;
    if (candles.length > 0) {
      this.series.setData(candles.map(c => ({ time: c.time as Time, value: c.value })));
      this.basePrice = candles[0].value;
      this.lastTime = candles[candles.length - 1].time;
    }
  }

  private onTick(price: number, ts: number) {
    if (!this.series) return;
    // ts arrives from Finnhub as ms epoch; lightweight-charts wants seconds.
    const time = Math.floor(ts / 1000);
    if (this.lastTime !== null && time <= this.lastTime) return;
    this.lastTime = time;
    if (this.basePrice === null) this.basePrice = price;
    const color = price >= this.basePrice ? GREEN : RED;
    this.series.applyOptions({ color });
    this.series.update({ time: time as Time, value: price });
  }
}
