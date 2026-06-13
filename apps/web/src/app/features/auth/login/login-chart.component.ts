import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  IChartApi,
  ISeriesApi,
  LineSeries,
  Time,
  createChart,
} from 'lightweight-charts';
import { PreviewPrice, PreviewService } from '../../../core/services/preview.service';

const GREEN = '#34D399'; // --pt-up
const RED   = '#F87171'; // --pt-down

@Component({
  standalone: true,
  selector: 'app-login-chart',
  template: `
    <div class="login-chart-shell">
      <div class="login-chart-header">AAPL</div>
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
        color: rgba(255, 255, 255, 0.85);
        font-weight: 600;
        font-size: 0.95rem;
        letter-spacing: 0.04em;
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

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Line'> | null = null;
  private sub: Subscription | null = null;
  private basePrice: number | null = null;
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
    });
    this.series = this.chart.addSeries(LineSeries, { color: GREEN });

    this.sub = this.preview.getPriceStream().subscribe(prices => this.onUpdate(prices));
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

  private onUpdate(prices: PreviewPrice[]) {
    if (!this.series) return;
    const aapl = prices.find(p => p.symbol === 'AAPL');
    if (!aapl || aapl.price == null || aapl.ts <= 0) return;
    if (this.lastTime !== null && aapl.ts <= this.lastTime) return;

    this.lastTime = aapl.ts;
    if (this.basePrice === null) this.basePrice = aapl.price;
    const color = aapl.price >= this.basePrice ? GREEN : RED;
    this.series.applyOptions({ color });
    this.series.update({ time: aapl.ts as Time, value: aapl.price });
  }
}
