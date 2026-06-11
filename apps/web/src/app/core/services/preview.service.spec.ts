import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PreviewService, PREVIEW_SYMBOLS_INITIAL, PreviewPrice } from './preview.service';

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
    const received: PreviewPrice[][] = [];
    const sub = service.getPriceStream().subscribe(p => received.push(p));

    const prices = PREVIEW_SYMBOLS_INITIAL.map(s => ({ ...s, price: 100, percentChange: 1 }));
    MockEventSource.lastInstance!.emit(prices);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(prices);
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

  it('emits multiple price updates as they arrive', () => {
    const received: PreviewPrice[][] = [];
    const sub = service.getPriceStream().subscribe(p => received.push(p));

    const prices1 = PREVIEW_SYMBOLS_INITIAL.map(s => ({ ...s, price: 100, percentChange: 1 }));
    const prices2 = PREVIEW_SYMBOLS_INITIAL.map(s => ({ ...s, price: 200, percentChange: 2 }));

    MockEventSource.lastInstance!.emit(prices1);
    MockEventSource.lastInstance!.emit(prices2);

    expect(received).toHaveLength(2);
    expect(received[1][0].price).toBe(200);
    sub.unsubscribe();
  });
});
