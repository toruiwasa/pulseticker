import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { of, throwError } from 'rxjs';

const mocks = vi.hoisted(() => {
  class MockSeries {
    static last: MockSeries;
    setData = vi.fn();
    update = vi.fn();
    applyOptions = vi.fn();
    constructor() {
      MockSeries.last = this;
    }
  }
  class MockChart {
    static last: MockChart;
    addSeries = vi.fn(() => new MockSeries());
    remove = vi.fn();
    constructor() {
      MockChart.last = this;
    }
  }
  return {
    MockSeries,
    MockChart,
    createChart: vi.fn(() => new MockChart()),
    LineSeries: Symbol('LineSeries'),
  };
});

vi.mock('lightweight-charts', () => ({
  createChart: mocks.createChart,
  LineSeries: mocks.LineSeries,
  // PriceChartComponent uses LineStyle.Dashed for grid/crosshair options
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2, LargeDashed: 3, SparseDotted: 4 },
}));

import { PriceChartComponent } from './price-chart.component';
import { ApiService } from '../../../core/services/api.service';
import { SocketService, PriceTick } from '../../../core/services/socket.service';
import { ThemeService } from '../../../core/services/theme.service';

// CSS var values expected by the chart component
const CSS_VARS: Record<string, string> = {
  '--pt-up':          '#22c55e',
  '--pt-down':        '#ef4444',
  '--pt-chart-grid':  '#2a2a3a',
  '--pt-chart-text':  '#9ca3af',
  '--pt-chart-cross': '#6b7280',
  '--pt-border':      '#374151',
};

describe('PriceChartComponent', () => {
  let api: { getCandles: ReturnType<typeof vi.fn> };
  let priceSubject: Subject<PriceTick>;
  let socket: { price$: Subject<PriceTick> };

  beforeEach(() => {
    mocks.createChart.mockClear();
    api = { getCandles: vi.fn(() => of([])) };
    priceSubject = new Subject<PriceTick>();
    socket = { price$: priceSubject };

    // PriceChartComponent reads chart colors from CSS custom properties.
    // Mock getComputedStyle so the chart receives the expected hex values.
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => CSS_VARS[prop.trim()] ?? '',
    } as CSSStyleDeclaration);

    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService,    useValue: api    },
        { provide: SocketService, useValue: socket },
        // Stub ThemeService — its isDark signal is read in an effect() for reactivity.
        // Providing a stub prevents TUI_DARK_MODE from calling window.matchMedia in jsdom.
        { provide: ThemeService,  useValue: { isDark: signal(false) } },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function mount(symbol: string | null) {
    const fixture = TestBed.createComponent(PriceChartComponent);
    fixture.componentRef.setInput('symbol', symbol);
    fixture.detectChanges();
    return fixture;
  }

  it('creates a chart with autoSize on mount', () => {
    mount(null);
    expect(mocks.createChart).toHaveBeenCalledOnce();
    expect(mocks.MockChart.last.addSeries).toHaveBeenCalledWith(mocks.LineSeries, { color: '#22c55e' });
  });

  it('fetches candles and sets history when a symbol is provided', () => {
    api.getCandles.mockReturnValue(of([
      { time: 100, value: 10 },
      { time: 200, value: 12 },
    ]));
    mount('AAPL');
    expect(api.getCandles).toHaveBeenCalledWith('AAPL', '1D');
    expect(mocks.MockSeries.last.setData).toHaveBeenLastCalledWith([
      { time: 100, value: 10 },
      { time: 200, value: 12 },
    ]);
  });

  it('renders incoming ticks for the active symbol and flips color below basePrice', () => {
    api.getCandles.mockReturnValue(of([{ time: 1000, value: 100 }]));
    mount('AAPL');

    // Tick above base — stays green
    priceSubject.next({ symbol: 'AAPL', price: 105, ts: 2_000_000 });
    expect(mocks.MockSeries.last.update).toHaveBeenLastCalledWith({ time: 2000, value: 105 });
    expect(mocks.MockSeries.last.applyOptions).toHaveBeenLastCalledWith({ color: '#22c55e' });

    // Tick below base — flips red
    priceSubject.next({ symbol: 'AAPL', price: 90, ts: 3_000_000 });
    expect(mocks.MockSeries.last.applyOptions).toHaveBeenLastCalledWith({ color: '#ef4444' });
  });

  it('ignores ticks for other symbols', () => {
    api.getCandles.mockReturnValue(of([]));
    mount('AAPL');
    mocks.MockSeries.last.update.mockClear();

    priceSubject.next({ symbol: 'MSFT', price: 400, ts: 2_000_000 });
    expect(mocks.MockSeries.last.update).not.toHaveBeenCalled();
  });

  it('clears the chart and refetches when symbol changes', () => {
    api.getCandles.mockReturnValue(of([{ time: 1000, value: 100 }]));
    const fixture = mount('AAPL');
    mocks.MockSeries.last.setData.mockClear();
    api.getCandles.mockClear();
    api.getCandles.mockReturnValue(of([{ time: 1100, value: 200 }]));

    fixture.componentRef.setInput('symbol', 'MSFT');
    fixture.detectChanges();

    // setData([]) is called first to clear, then with new history
    expect(mocks.MockSeries.last.setData).toHaveBeenCalledWith([]);
    expect(api.getCandles).toHaveBeenCalledWith('MSFT', '1D');
  });

  it('treats getCandles errors as empty history (chart builds from ticks)', () => {
    api.getCandles.mockReturnValue(throwError(() => new Error('500')));
    mount('AAPL');
    // No history applied — basePrice gets set from the first tick instead
    priceSubject.next({ symbol: 'AAPL', price: 50, ts: 2_000_000 });
    expect(mocks.MockSeries.last.update).toHaveBeenLastCalledWith({ time: 2000, value: 50 });
    expect(mocks.MockSeries.last.applyOptions).toHaveBeenLastCalledWith({ color: '#22c55e' });
  });

  it('removes the chart and unsubscribes on destroy', () => {
    const fixture = mount('AAPL');
    const chart = mocks.MockChart.last;
    fixture.destroy();
    expect(chart.remove).toHaveBeenCalledOnce();

    // After destroy, subsequent ticks must not throw
    expect(() => priceSubject.next({ symbol: 'AAPL', price: 1, ts: 9_000_000 })).not.toThrow();
  });
});
