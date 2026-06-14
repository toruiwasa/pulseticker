import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import type { Session } from '@supabase/supabase-js';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';
import { WatchlistStateService, WatchlistItem } from './watchlist-state.service';

const fakeSession = { access_token: 'tok' } as unknown as Session;

const makeItem = (symbol: string, id = symbol): WatchlistItem => ({
  id,
  symbol,
  created_at: '2024-01-01',
});

describe('WatchlistStateService', () => {
  let service: WatchlistStateService;
  let apiStub: {
    get:      ReturnType<typeof vi.fn>;
    post:     ReturnType<typeof vi.fn>;
    delete:   ReturnType<typeof vi.fn>;
    getQuote: ReturnType<typeof vi.fn>;
  };
  let priceSubject: Subject<{ symbol: string; price: number; ts: number }>;
  let socketStub: {
    connect:    ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    subscribe:  ReturnType<typeof vi.fn>;
    price$:     Subject<{ symbol: string; price: number; ts: number }>;
    alert$:     Subject<unknown>;
  };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    priceSubject = new Subject();
    apiStub = {
      get:      vi.fn().mockReturnValue(of([makeItem('AAPL')])),
      post:     vi.fn().mockReturnValue(of(makeItem('GOOG'))),
      delete:   vi.fn().mockReturnValue(of(null)),
      getQuote: vi.fn().mockReturnValue(of({ c: 150, pc: 148, t: 1000 })),
    };
    socketStub = {
      connect:    vi.fn(),
      disconnect: vi.fn(),
      subscribe:  vi.fn(),
      price$:     priceSubject,
      alert$:     new Subject(),
    };

    TestBed.configureTestingModule({
      providers: [
        WatchlistStateService,
        { provide: ApiService,    useValue: apiStub    },
        { provide: SocketService, useValue: socketStub },
      ],
    });

    service = TestBed.inject(WatchlistStateService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('load()', () => {
    it('connects the socket with the session token', () => {
      service.load(fakeSession);
      expect(socketStub.connect).toHaveBeenCalledWith('tok');
    });

    it('fetches /watchlist and populates watchlist signal', () => {
      service.load(fakeSession);
      expect(apiStub.get).toHaveBeenCalledWith('/watchlist');
      expect(service.watchlist()).toEqual([makeItem('AAPL')]);
    });

    it('sets loading to false after data arrives', () => {
      service.load(fakeSession);
      expect(service.loading()).toBe(false);
    });

    it('subscribes socket to loaded symbols', () => {
      service.load(fakeSession);
      expect(socketStub.subscribe).toHaveBeenCalledWith(['AAPL']);
    });

    it('is a no-op on second call (loaded guard)', () => {
      service.load(fakeSession);
      service.load(fakeSession);
      expect(apiStub.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('price$ subscription', () => {
    it('updates prices signal when a price tick arrives', () => {
      service.load(fakeSession);
      priceSubject.next({ symbol: 'AAPL', price: 200, ts: Date.now() });
      expect(service.prices()['AAPL']).toBe(200);
    });

    it('marks the symbol as live on price tick', () => {
      service.load(fakeSession);
      priceSubject.next({ symbol: 'AAPL', price: 200, ts: Date.now() });
      expect(service.isLive()['AAPL']).toBe(true);
    });
  });

  describe('addSymbol()', () => {
    it('calls POST /watchlist and appends the item', () => {
      service.load(fakeSession);
      service.addSymbol('GOOG');
      expect(apiStub.post).toHaveBeenCalledWith('/watchlist', { symbol: 'GOOG' });
      expect(service.watchlist().some(i => i.symbol === 'GOOG')).toBe(true);
    });

    it('is a no-op when atLimit (50 items)', () => {
      const items = Array.from({ length: 50 }, (_, i) => makeItem(`SYM${i}`, `id${i}`));
      service.watchlist.set(items);
      service.addSymbol('EXTRA');
      expect(apiStub.post).not.toHaveBeenCalled();
    });
  });

  describe('removeSymbol()', () => {
    beforeEach(() => service.load(fakeSession));

    it('calls DELETE /watchlist/:symbol and removes item from list', () => {
      service.removeSymbol('AAPL');
      expect(apiStub.delete).toHaveBeenCalledWith('/watchlist/AAPL');
      expect(service.watchlist().some(i => i.symbol === 'AAPL')).toBe(false);
    });

    it('returns true when the removed symbol was selected', () => {
      const wasSelected = service.removeSymbol('AAPL', 'AAPL');
      expect(wasSelected).toBe(true);
    });

    it('returns false when the removed symbol was not selected', () => {
      const wasSelected = service.removeSymbol('AAPL', 'GOOG');
      expect(wasSelected).toBe(false);
    });
  });
});
