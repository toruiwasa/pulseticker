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
import { PreviewService, PreviewPrice } from '../../../core/services/preview.service';

function aapl(price: number | null, ts: number): PreviewPrice {
  return { symbol: 'AAPL', raw: 'AAPL', price, percentChange: 0, ts };
}

describe('LoginChartComponent', () => {
  let stream: Subject<PreviewPrice[]>;
  let preview: { getPriceStream: () => Subject<PreviewPrice[]> };

  beforeEach(() => {
    mocks.createChart.mockClear();
    stream = new Subject<PreviewPrice[]>();
    preview = { getPriceStream: () => stream };
    TestBed.configureTestingModule({
      providers: [{ provide: PreviewService, useValue: preview }],
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

  it('updates the series when AAPL ticks arrive', () => {
    mount();
    stream.next([aapl(185, 1000)]);
    expect(mocks.MockSeries.last.update).toHaveBeenLastCalledWith({ time: 1000, value: 185 });
  });

  it('flips color to red when price falls below basePrice', () => {
    mount();
    stream.next([aapl(185, 1000)]);
    stream.next([aapl(180, 1100)]);
    expect(mocks.MockSeries.last.applyOptions).toHaveBeenLastCalledWith({ color: '#F87171' });
  });

  it('skips duplicate or stale timestamps', () => {
    mount();
    stream.next([aapl(185, 1000)]);
    mocks.MockSeries.last.update.mockClear();
    stream.next([aapl(186, 1000)]); // same ts
    stream.next([aapl(186, 500)]);  // older ts
    expect(mocks.MockSeries.last.update).not.toHaveBeenCalled();
  });

  it('ignores updates with no AAPL entry or null price', () => {
    mount();
    stream.next([{ symbol: 'MSFT', raw: 'MSFT', price: 400, percentChange: 0, ts: 1000 }]);
    stream.next([aapl(null, 1000)]);
    stream.next([aapl(185, 0)]);
    expect(mocks.MockSeries.last.update).not.toHaveBeenCalled();
  });

  it('tears down the chart on destroy', () => {
    const fixture = mount();
    const chart = mocks.MockChart.last;
    fixture.destroy();
    expect(chart.remove).toHaveBeenCalledOnce();
  });
});
