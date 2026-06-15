import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import {
  IChartApi,
  ISeriesApi,
  LineSeries,
  Time,
  createChart,
} from 'lightweight-charts';
import { CandlePoint } from '../../../core/services/api.service';
import { PreviewPrice, PreviewService } from '../../../core/services/preview.service';

const GREEN = '#34D399'; // --pt-up
const RED   = '#F87171'; // --pt-down

@Component({
  standalone: true,
  selector: 'app-login-chart',
  imports: [DecimalPipe],
  template: `
    <div class="login-chart-shell">
      <div class="login-chart-header">
        <span class="chart-symbol">AAPL</span>
        @if (aaplPrice() != null) {
          <span class="chart-price">
            {{ aaplPrice() | number:'1.2-2' }}<span class="chart-currency">USD</span>
          </span>
        }
      </div>
      <div #host class="login-chart-container"></div>
    </div>
  `,
  styles: [
    `
      .login-chart-shell {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
      }
      .login-chart-header {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .chart-symbol {
        color: rgba(255, 255, 255, 0.85);
        font-weight: 600;
        font-size: 0.95rem;
        letter-spacing: 0.04em;
      }
      .chart-price {
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.85rem;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        display: inline-flex;
        align-items: baseline;
        gap: 2px;
      }
      .chart-currency {
        font-size: 0.6rem;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.45);
        letter-spacing: 0.03em;
      }
      .login-chart-container {
        width: 100%;
        max-width: 600px;
        height: 280px;
      }
      @media (max-width: 768px) {
        .login-chart-container {
          height: 200px;
        }
      }
    `,
  ],
})
export class LoginChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;

  private preview = inject(PreviewService);

  protected aaplPrice = signal<number | null>(null);

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Line'> | null = null;
  private sub: Subscription | null = null;
  private basePrice: number | null = null;
  // Stored in milliseconds to match aapl.ts from PreviewPrice; convert to seconds only on series.update()
  private lastTime: number | null = null;

  ngAfterViewInit() {
    this.chart = createChart(this.host.nativeElement, {
      autoSize: true,
      layout: {
        attributionLogo: false,
        background: { color: 'transparent' },
        textColor: 'rgba(255,255,255,0.7)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    this.series = this.chart.addSeries(LineSeries, { color: GREEN });

    this.sub = this.preview.getPriceStream().subscribe(snapshot => {
      if (snapshot.candles) this.applyHistory(snapshot.candles);
      this.onUpdate(snapshot.prices);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.sub = null;
    this.chart?.remove();
    this.chart = null;
    this.series = null;
    this.basePrice = null;
    this.lastTime = null;
  }

  private applyHistory(candles: CandlePoint[]) {
    if (!this.series || candles.length === 0) return;
    this.series.setData(candles.map(c => ({ time: c.time as Time, value: c.value })));
    this.basePrice = candles[0].value;
    // Convert last candle's Unix seconds back to ms so lastTime stays in the same unit as aapl.ts
    this.lastTime = candles[candles.length - 1].time * 1000;
  }

  private onUpdate(prices: PreviewPrice[]) {
    if (!this.series) return;
    const aapl = prices.find(p => p.symbol === 'AAPL');
    if (!aapl || aapl.price == null || aapl.ts <= 0) return;
    if (this.lastTime !== null && aapl.ts <= this.lastTime) return;

    this.lastTime = aapl.ts;
    this.aaplPrice.set(aapl.price);
    if (this.basePrice === null) this.basePrice = aapl.price;
    const color = aapl.price >= this.basePrice ? GREEN : RED;
    this.series.applyOptions({ color });
    this.series.update({ time: Math.floor(aapl.ts / 1000) as Time, value: aapl.price });
  }
}
