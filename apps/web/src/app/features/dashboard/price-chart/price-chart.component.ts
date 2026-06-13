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
  LineStyle,
  LineSeries,
  Time,
  createChart,
} from 'lightweight-charts';
import { ApiService, CandlePoint, ChartRange } from '../../../core/services/api.service';
import { SocketService } from '../../../core/services/socket.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  standalone: true,
  selector: 'app-price-chart',
  template: `
    <div class="chart-shell">
      <div #host class="chart-container"></div>
      <div class="sr-only" aria-live="polite" aria-atomic="true">{{ a11yLabel() }}</div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .chart-shell { width: 100%; height: 100%; }
    .chart-container { width: 100%; height: 100%; }
  `],
})
export class PriceChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>;
  readonly symbol = input<string | null>(null);
  readonly range = input<ChartRange>('1D');

  private api = inject(ApiService);
  private socket = inject(SocketService);
  private theme = inject(ThemeService);

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Line'> | null = null;
  private tickSub: Subscription | null = null;
  private basePrice: number | null = null;
  private lastTime: number | null = null;
  private lastPrice: number | null = null;

  protected a11yLabel = () => {
    const sym = this.symbol();
    const p = this.lastPrice;
    if (!sym || p === null) return '';
    return `${sym} current price ${p.toFixed(2)}`;
  };

  constructor() {
    effect(() => {
      const sym = this.symbol();
      const range = this.range();
      if (!this.series) return;
      this.loadSymbol(sym, range);
    });

    effect(() => {
      if (!this.chart) return;
      const c = this.chartColors();
      this.chart.applyOptions({
        layout: { background: { color: 'transparent' }, textColor: c.text },
        grid: {
          vertLines: { color: c.grid, style: LineStyle.Dashed },
          horzLines: { color: c.grid, style: LineStyle.Dashed },
        },
        crosshair: { vertLine: { color: c.cross }, horzLine: { color: c.cross } },
      });
    });
  }

  ngAfterViewInit() {
    const c = this.chartColors();
    this.chart = createChart(this.host.nativeElement, {
      autoSize: true,
      layout: { attributionLogo: false, background: { color: 'transparent' }, textColor: c.text },
      grid: {
        vertLines: { color: c.grid, style: LineStyle.Dashed },
        horzLines: { color: c.grid, style: LineStyle.Dashed },
      },
      crosshair: { vertLine: { color: c.cross }, horzLine: { color: c.cross } },
    });
    this.series = this.chart.addSeries(LineSeries, { color: this.upColor() });

    const sym = this.symbol();
    if (sym) this.loadSymbol(sym, this.range());
  }

  ngOnDestroy() {
    this.tickSub?.unsubscribe();
    this.chart?.remove();
    this.chart = null;
    this.series = null;
  }

  private cssVar(name: string): string {
    return getComputedStyle(this.host.nativeElement).getPropertyValue(name).trim();
  }

  private upColor()   { return this.cssVar('--pt-up'); }
  private downColor() { return this.cssVar('--pt-down'); }

  private chartColors() {
    // isDark() reactive — effect() re-runs on theme change
    void this.theme.isDark();
    return {
      grid:  this.cssVar('--pt-chart-grid'),
      text:  this.cssVar('--pt-chart-text'),
      cross: this.cssVar('--pt-chart-cross'),
    };
  }

  private loadSymbol(sym: string | null, range: ChartRange) {
    this.tickSub?.unsubscribe();
    this.tickSub = null;
    this.basePrice = null;
    this.lastTime = null;
    this.lastPrice = null;
    if (this.series) this.series.setData([]);
    if (!sym) return;

    this.api.getCandles(sym, range).subscribe({
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
      this.lastPrice = candles[candles.length - 1].value;
    }
  }

  private onTick(price: number, ts: number) {
    if (!this.series) return;
    const time = Math.floor(ts / 1000);
    if (this.lastTime !== null && time <= this.lastTime) return;
    this.lastTime = time;
    this.lastPrice = price;
    if (this.basePrice === null) this.basePrice = price;
    const color = price >= this.basePrice ? this.upColor() : this.downColor();
    this.series.applyOptions({ color });
    this.series.update({ time: time as Time, value: price });
  }
}
