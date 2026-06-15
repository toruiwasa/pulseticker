import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

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
}));

import { LoginChartComponent } from './login-chart.component';
import { PreviewService, PreviewSnapshot, PreviewPrice } from '../../../core/services/preview.service';

function makeSnapshot(aaplPrice: number | null, ts: number, candles: { time: number; value: number }[] | null = null): PreviewSnapshot {
  const prices: PreviewPrice[] = [
    { symbol: 'AAPL', raw: 'AAPL', currency: 'USD', price: aaplPrice, percentChange: 0, ts },
  ];
  return { prices, candles };
}

describe('LoginChartComponent', () => {
  let stream: Subject<PreviewSnapshot>;
  let preview: { getPriceStream: () => Subject<PreviewSnapshot> };

  beforeEach(() => {
    mocks.createChart.mockClear();
    stream = new Subject<PreviewSnapshot>();
    preview = { getPriceStream: () => stream };
    TestBed.configureTestingModule({
      providers: [
        { provide: PreviewService, useValue: preview },
      ],
    });
  });

  function mount() {
    const fixture = TestBed.createComponent(LoginChartComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('builds the chart and subscribes to the preview stream on mount', () => {
    mount();
    expect(mocks.createChart).toHaveBeenCalledOnce();
    expect(mocks.MockChart.last.addSeries).toHaveBeenCalledWith(mocks.LineSeries, { color: '#34D399' });
  });

  it('seeds the series with candles from the first snapshot', () => {
    mount();
    stream.next(makeSnapshot(180, 2000, [{ time: 1000, value: 180 }, { time: 1060, value: 182 }]));
    expect(mocks.MockSeries.last.setData).toHaveBeenCalledWith([
      { time: 1000, value: 180 },
      { time: 1060, value: 182 },
    ]);
  });

  it('tick after history: dedup prevents tick at or before last candle time', () => {
    mount();
    stream.next(makeSnapshot(180, 1000, [{ time: 1, value: 180 }]));
    // lastTime is now 1 * 1000 = 1000ms. A tick with ts=1000 should be skipped.
    mocks.MockSeries.last.update.mockClear();
    stream.next(makeSnapshot(181, 1000, null));
    expect(mocks.MockSeries.last.update).not.toHaveBeenCalled();
  });

  it('updates the series when AAPL ticks arrive (ts in ms → time in seconds)', () => {
    mount();
    stream.next(makeSnapshot(185, 2000, null));
    expect(mocks.MockSeries.last.update).toHaveBeenLastCalledWith({ time: 2, value: 185 });
  });

  it('flips color to red when price falls below basePrice', () => {
    mount();
    stream.next(makeSnapshot(185, 2000, null));
    stream.next(makeSnapshot(180, 3000, null));
    expect(mocks.MockSeries.last.applyOptions).toHaveBeenLastCalledWith({ color: '#F87171' });
  });

  it('skips duplicate or stale timestamps', () => {
    mount();
    stream.next(makeSnapshot(185, 2000, null));
    mocks.MockSeries.last.update.mockClear();
    stream.next(makeSnapshot(186, 2000, null)); // same ts
    stream.next(makeSnapshot(186, 500, null));  // older ts
    expect(mocks.MockSeries.last.update).not.toHaveBeenCalled();
  });

  it('ignores updates with null price or ts=0', () => {
    mount();
    stream.next(makeSnapshot(null, 2000, null));
    stream.next(makeSnapshot(185, 0, null));
    expect(mocks.MockSeries.last.update).not.toHaveBeenCalled();
  });

  it('tears down the chart on destroy', () => {
    const fixture = mount();
    const chart = mocks.MockChart.last;
    fixture.destroy();
    expect(chart.remove).toHaveBeenCalledOnce();
  });
});
