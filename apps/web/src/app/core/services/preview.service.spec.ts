import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PreviewService, PREVIEW_SYMBOLS_INITIAL, PreviewSnapshot } from './preview.service';

const STUB_CANDLES = [{ time: 1000, value: 180 }];

class MockEventSource {
  static lastInstance: MockEventSource | undefined;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    MockEventSource.lastInstance = this;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  close() { this.closed = true; }
}

function makeSnapshot(price: number, candles = null as typeof STUB_CANDLES | null): PreviewSnapshot {
  return {
    prices: PREVIEW_SYMBOLS_INITIAL.map(s => ({ ...s, price, percentChange: 1 })),
    candles,
  };
}

describe('PreviewService', () => {
  let service: PreviewService;
  let hiddenValue = false;

  beforeEach(() => {
    MockEventSource.lastInstance = undefined;
    vi.stubGlobal('EventSource', MockEventSource);

    Object.defineProperty(document, 'hidden', {
      get: () => hiddenValue,
      configurable: true,
    });
    hiddenValue = false;

    TestBed.configureTestingModule({ providers: [PreviewService] });
    service = TestBed.inject(PreviewService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens an EventSource connection when document is visible', () => {
    const received: PreviewSnapshot[] = [];
    const sub = service.getPriceStream().subscribe(s => received.push(s));

    MockEventSource.lastInstance!.emit(makeSnapshot(100, STUB_CANDLES));

    expect(received).toHaveLength(1);
    expect(received[0].prices[0].price).toBe(100);
    expect(received[0].candles).toEqual(STUB_CANDLES);
    sub.unsubscribe();
  });

  it('closes the EventSource when unsubscribed', () => {
    const sub = service.getPriceStream().subscribe(() => {});
    const es = MockEventSource.lastInstance!;
    sub.unsubscribe();
    expect(es.closed).toBe(true);
  });

  it('does not open EventSource when document is hidden', () => {
    hiddenValue = true;
    const instanceBefore = MockEventSource.lastInstance;

    const sub = service.getPriceStream().subscribe(() => {});
    expect(MockEventSource.lastInstance).toBe(instanceBefore);
    sub.unsubscribe();
  });

  it('handles malformed SSE data without throwing', () => {
    const errors: unknown[] = [];
    const sub = service.getPriceStream().subscribe({ error: e => errors.push(e) });

    MockEventSource.lastInstance!.onmessage?.({ data: 'not-json{{{' } as MessageEvent);

    expect(errors).toHaveLength(0);
    sub.unsubscribe();
  });

  it('emits multiple snapshots as they arrive; tick-only messages have candles: null', () => {
    const received: PreviewSnapshot[] = [];
    const sub = service.getPriceStream().subscribe(s => received.push(s));

    MockEventSource.lastInstance!.emit(makeSnapshot(100, STUB_CANDLES));
    MockEventSource.lastInstance!.emit(makeSnapshot(200, null));

    expect(received).toHaveLength(2);
    expect(received[0].candles).toEqual(STUB_CANDLES);
    expect(received[1].prices[0].price).toBe(200);
    expect(received[1].candles).toBeNull();
    sub.unsubscribe();
  });
});
