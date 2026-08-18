import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../supabase/supabase/supabase.service.js';
import { FinnhubService } from '../../finnhub/finnhub/finnhub.service.js';
import { WatchlistService } from './watchlist.service.js';

type SupabaseMock = {
  from: jest.Mock;
};

function makeCountChain(returnVal: { count: number | null; error: unknown }) {
  const eq = jest.fn().mockResolvedValue(returnVal);
  const select = jest.fn(() => ({ eq }));
  return { from: jest.fn(() => ({ select })) };
}

/** Builds a from() router for the new findAll flow. */
function makeFindAllRouter(opts: {
  profile: { data: { user_id: string } | null; error: unknown };
  watchlist: { data: unknown; error: unknown };
  upsertError?: unknown;
  profileInsertError?: unknown;
  seededWatchlist?: { data: unknown; error: unknown };
}) {
  const profileMaybeSingle = jest.fn().mockResolvedValue(opts.profile);
  const profileEq = jest.fn(() => ({ maybeSingle: profileMaybeSingle }));
  const profileSelect = jest.fn(() => ({ eq: profileEq }));

  const watchlistOrder = jest.fn().mockResolvedValue(opts.watchlist);
  const watchlistEq = jest.fn(() => ({ order: watchlistOrder }));
  const watchlistSelect = jest.fn(() => ({ eq: watchlistEq }));

  const upsert = jest.fn().mockResolvedValue({ error: opts.upsertError ?? null });
  const profileInsert = jest.fn().mockResolvedValue({ error: opts.profileInsertError ?? null });

  const seededOrder = jest.fn().mockResolvedValue(opts.seededWatchlist ?? { data: [], error: null });
  const seededEq = jest.fn(() => ({ order: seededOrder }));
  const seededSelect = jest.fn(() => ({ eq: seededEq }));

  let watchlistCall = 0;
  const from = jest.fn((table: string) => {
    if (table === 'user_profiles') {
      // First call: select, subsequent: insert
      if (profileSelect.mock.calls.length === 0) return { select: profileSelect, insert: profileInsert };
      return { insert: profileInsert };
    }
    if (table === 'watchlist_items') {
      watchlistCall += 1;
      if (watchlistCall === 1) return { select: watchlistSelect };
      if (watchlistCall === 2) return { upsert };
      return { select: seededSelect };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return { from, upsert, profileInsert };
}

describe('WatchlistService', () => {
  let service: WatchlistService;
  let supabaseClient: SupabaseMock;
  let fetchMock: jest.SpyInstance;
  let finnhub: { getLastKnownPrices: jest.Mock };

  beforeEach(async () => {
    supabaseClient = { from: jest.fn() };
    finnhub = { getLastKnownPrices: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WatchlistService,
        { provide: SupabaseService, useValue: { client: supabaseClient } },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('test-key') } },
        { provide: FinnhubService, useValue: finnhub },
      ],
    }).compile();
    service = moduleRef.get(WatchlistService);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('findAll', () => {
    it('seeds defaults and inserts profile on first visit (no profile + empty watchlist)', async () => {
      const seeded = [
        { id: '1', symbol: 'VOO', created_at: '2026-01-01' },
        { id: '2', symbol: 'AAPL', created_at: '2026-01-01' },
      ];
      const router = makeFindAllRouter({
        profile: { data: null, error: null },
        watchlist: { data: [], error: null },
        seededWatchlist: { data: seeded, error: null },
      });
      supabaseClient.from = router.from;

      const result = await service.findAll('u1');
      expect(result).toEqual(seeded);
      expect(router.upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          { user_id: 'u1', symbol: 'VOO' },
          { user_id: 'u1', symbol: 'AAPL' },
          { user_id: 'u1', symbol: 'MSFT' },
          { user_id: 'u1', symbol: 'OANDA:AUD_USD' },
          { user_id: 'u1', symbol: 'OANDA:AUD_JPY' },
        ]),
        { onConflict: 'user_id,symbol', ignoreDuplicates: true },
      );
      expect(router.profileInsert).toHaveBeenCalledWith({ user_id: 'u1' });
    });

    it('returns existing items without seeding when profile exists', async () => {
      const existing = [{ id: '1', symbol: 'TSLA', created_at: '2026-01-01' }];
      const router = makeFindAllRouter({
        profile: { data: { user_id: 'u1' }, error: null },
        watchlist: { data: existing, error: null },
      });
      supabaseClient.from = router.from;

      const result = await service.findAll('u1');
      expect(result).toEqual(existing);
      expect(router.upsert).not.toHaveBeenCalled();
      expect(router.profileInsert).not.toHaveBeenCalled();
    });

    it('does NOT re-seed when profile exists and watchlist is empty (the bug fix)', async () => {
      const router = makeFindAllRouter({
        profile: { data: { user_id: 'u1' }, error: null },
        watchlist: { data: [], error: null },
      });
      supabaseClient.from = router.from;

      const result = await service.findAll('u1');
      expect(result).toEqual([]);
      expect(router.upsert).not.toHaveBeenCalled();
      expect(router.profileInsert).not.toHaveBeenCalled();
    });

    it('throws when profile lookup errors', async () => {
      const router = makeFindAllRouter({
        profile: { data: null, error: new Error('profile boom') },
        watchlist: { data: [], error: null },
      });
      supabaseClient.from = router.from;
      await expect(service.findAll('u1')).rejects.toThrow('profile boom');
    });

    it('throws when watchlist select errors', async () => {
      const router = makeFindAllRouter({
        profile: { data: null, error: null },
        watchlist: { data: null, error: new Error('watchlist boom') },
      });
      supabaseClient.from = router.from;
      await expect(service.findAll('u1')).rejects.toThrow('watchlist boom');
    });
  });

  describe('create', () => {
    it('throws BadRequestException when count is already 50', async () => {
      supabaseClient.from = makeCountChain({ count: 50, error: null }).from;
      await expect(service.create('u1', 'AAPL')).rejects.toThrow(BadRequestException);
    });

    it('inserts and returns item when count < 50', async () => {
      const item = { id: '1', symbol: 'AAPL', created_at: '2026-01-01' };
      const countEq = jest.fn().mockResolvedValue({ count: 5, error: null });
      const countSelect = jest.fn(() => ({ eq: countEq }));

      const single = jest.fn().mockResolvedValue({ data: item, error: null });
      const insertSelect = jest.fn(() => ({ single }));
      const insert = jest.fn(() => ({ select: insertSelect }));

      let call = 0;
      supabaseClient.from = jest.fn(() => {
        call += 1;
        if (call === 1) return { select: countSelect };
        return { insert };
      });

      const result = await service.create('u1', 'aapl');
      expect(result).toEqual(item);
      expect(insert).toHaveBeenCalledWith({ user_id: 'u1', symbol: 'AAPL' });
    });

    it('throws ConflictException on duplicate (23505)', async () => {
      const countEq = jest.fn().mockResolvedValue({ count: 5, error: null });
      const countSelect = jest.fn(() => ({ eq: countEq }));

      const single = jest.fn().mockResolvedValue({ data: null, error: { code: '23505' } });
      const insertSelect = jest.fn(() => ({ single }));
      const insert = jest.fn(() => ({ select: insertSelect }));

      let call = 0;
      supabaseClient.from = jest.fn(() => {
        call += 1;
        if (call === 1) return { select: countSelect };
        return { insert };
      });

      await expect(service.create('u1', 'AAPL')).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('deletes by user and symbol', async () => {
      const eqSymbol = jest.fn().mockResolvedValue({ error: null });
      const eqUser = jest.fn(() => ({ eq: eqSymbol }));
      const del = jest.fn(() => ({ eq: eqUser }));
      supabaseClient.from = jest.fn(() => ({ delete: del })) as never;
      await service.remove('u1', 'aapl');
      expect(eqUser).toHaveBeenCalledWith('user_id', 'u1');
      expect(eqSymbol).toHaveBeenCalledWith('symbol', 'AAPL');
    });
  });

  describe('searchSymbols', () => {
    const oandaList = [
      { symbol: 'OANDA:AUD_USD', displaySymbol: 'AUD/USD', description: 'AUD/USD' },
      { symbol: 'OANDA:AUD_JPY', displaySymbol: 'AUD/JPY', description: 'AUD/JPY' },
      { symbol: 'OANDA:USD_JPY', displaySymbol: 'USD/JPY', description: 'USD/JPY' },
      { symbol: 'OANDA:EUR_USD', displaySymbol: 'EUR/USD', description: 'EUR/USD' },
    ];

    function mockForexSymbol() {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(oandaList),
      } as never);
    }

    function mockSearch(result: { symbol: string; description: string; type: string }[]) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result }),
      } as never);
    }

    it('returns FX matches from OANDA cache when query is a currency code', async () => {
      mockForexSymbol();
      mockSearch([]);
      const out = await service.searchSymbols('JPY');
      const symbols = out.map(r => r.symbol);
      expect(symbols).toContain('OANDA:AUD_JPY');
      expect(symbols).toContain('OANDA:USD_JPY');
    });

    it('matches multi-token queries (e.g. "AUD USD")', async () => {
      mockForexSymbol();
      mockSearch([]);
      const out = await service.searchSymbols('AUD USD');
      const symbols = out.map(r => r.symbol);
      expect(symbols).toContain('OANDA:AUD_USD');
      expect(symbols).not.toContain('OANDA:AUD_JPY');
    });

    it('returns Common Stock and ETP equity results, excluding others', async () => {
      mockForexSymbol();
      mockSearch([
        { symbol: 'AAPL', description: 'Apple Inc', type: 'Common Stock' },
        { symbol: 'VOO', description: 'Vanguard S&P 500', type: 'ETP' },
        { symbol: 'XYZ', description: 'Other', type: 'ADR' },
      ]);
      const out = await service.searchSymbols('apple');
      const symbols = out.map(r => r.symbol);
      expect(symbols).toContain('AAPL');
      expect(symbols).toContain('VOO');
      expect(symbols).not.toContain('XYZ');
    });

    it('caps merged results at 10 with FX taking up to 5 slots', async () => {
      mockForexSymbol();
      mockSearch(
        Array.from({ length: 20 }, (_, i) => ({
          symbol: `STK${i}`,
          description: `Stock ${i}`,
          type: 'Common Stock',
        })),
      );
      const out = await service.searchSymbols('usd');
      expect(out.length).toBe(10);
      const fxCount = out.filter(r => r.symbol.startsWith('OANDA:')).length;
      expect(fxCount).toBeLessThanOrEqual(5);
    });

    it('does not refetch OANDA cache on subsequent calls', async () => {
      mockForexSymbol();
      mockSearch([]);
      await service.searchSymbols('JPY');
      mockSearch([]);
      await service.searchSymbols('AUD');
      const forexCalls = fetchMock.mock.calls.filter(c =>
        String(c[0]).includes('/forex/symbol'),
      );
      expect(forexCalls.length).toBe(1);
    });

    it('degrades gracefully when /forex/symbol returns 403 (paid-tier)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as never);
      mockSearch([
        { symbol: 'AAPL', description: 'Apple Inc', type: 'Common Stock' },
      ]);
      const out = await service.searchSymbols('apple');
      expect(out.map(r => r.symbol)).toEqual(['AAPL']);
    });

    it('throws when /search response is not ok', async () => {
      mockForexSymbol();
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as never);
      await expect(service.searchSymbols('q')).rejects.toThrow('Finnhub search failed: 500');
    });
  });

  describe('getQuote', () => {
    it('returns c, pc, t from fetch response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ c: 150.25, pc: 149, t: 1700000000, other: 'ignore' }),
      } as never);

      const out = await service.getQuote('AAPL');
      expect(out).toEqual({ c: 150.25, pc: 149, t: 1700000000 });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://finnhub.io/api/v1/quote?symbol=AAPL&token=test-key',
      );
    });

    it('throws when the response is not ok', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 429 } as never);
      await expect(service.getQuote('AAPL')).rejects.toThrow('Finnhub quote failed for AAPL: 429');
    });
  });
  describe('getWatchlistPrices', () => {
    const ID_A = '11111111-1111-4111-8111-111111111111';
    const ID_B = '22222222-2222-4222-8222-222222222222';

    /** findAll() with an existing profile short-circuits to the first select. */
    function seededWith(rows: unknown[]) {
      supabaseClient.from = makeFindAllRouter({
        profile: { data: { user_id: 'u1' }, error: null },
        watchlist: { data: rows, error: null },
      }).from;
    }

    it('maps rows onto cached prices and reports cached: true', async () => {
      seededWith([
        { id: ID_A, symbol: 'AAPL', created_at: '2026-01-01' },
        { id: ID_B, symbol: 'OANDA:AUD_USD', created_at: '2026-01-02' },
      ]);
      finnhub.getLastKnownPrices.mockReturnValue([
        { symbol: 'AAPL', price: 195.23, ts: 1709123456789 },
        { symbol: 'OANDA:AUD_USD', price: 0.6612, ts: 1709123456790 },
      ]);

      await expect(service.getWatchlistPrices('u1')).resolves.toEqual({
        cached: true,
        items: [
          { id: ID_A, symbol: 'AAPL', price: 195.23, ts: 1709123456789 },
          { id: ID_B, symbol: 'OANDA:AUD_USD', price: 0.6612, ts: 1709123456790 },
        ],
      });
    });

    it('passes the watchlist symbols through to getLastKnownPrices', async () => {
      seededWith([
        { id: ID_A, symbol: 'AAPL', created_at: '2026-01-01' },
        { id: ID_B, symbol: 'MSFT', created_at: '2026-01-02' },
      ]);
      finnhub.getLastKnownPrices.mockReturnValue([
        { symbol: 'AAPL', price: null, ts: null },
        { symbol: 'MSFT', price: null, ts: null },
      ]);

      await service.getWatchlistPrices('u1');
      expect(finnhub.getLastKnownPrices).toHaveBeenCalledWith(['AAPL', 'MSFT']);
    });

    it('reports cached: false only when the cache yielded nothing at all', async () => {
      seededWith([
        { id: ID_A, symbol: 'AAPL', created_at: '2026-01-01' },
        { id: ID_B, symbol: 'MSFT', created_at: '2026-01-02' },
      ]);
      finnhub.getLastKnownPrices.mockReturnValue([
        { symbol: 'AAPL', price: null, ts: null },
        { symbol: 'MSFT', price: null, ts: null },
      ]);

      await expect(service.getWatchlistPrices('u1')).resolves.toMatchObject({ cached: false });
    });

    it('stays cached: true when only some symbols are missing a price', async () => {
      seededWith([
        { id: ID_A, symbol: 'AAPL', created_at: '2026-01-01' },
        { id: ID_B, symbol: 'MSFT', created_at: '2026-01-02' },
      ]);
      finnhub.getLastKnownPrices.mockReturnValue([
        { symbol: 'AAPL', price: 195.23, ts: 1709123456789 },
        { symbol: 'MSFT', price: null, ts: null },
      ]);

      const out = await service.getWatchlistPrices('u1');
      expect(out.cached).toBe(true);
      expect(out.items[1]).toEqual({ id: ID_B, symbol: 'MSFT', price: null, ts: null });
    });

    it('returns cached: true for an empty watchlist', async () => {
      seededWith([]);
      finnhub.getLastKnownPrices.mockReturnValue([]);

      await expect(service.getWatchlistPrices('u1')).resolves.toEqual({ cached: true, items: [] });
    });

    it('uses the symbol as the cache normalised it, not the stored casing', async () => {
      seededWith([{ id: ID_A, symbol: 'aapl', created_at: '2026-01-01' }]);
      finnhub.getLastKnownPrices.mockReturnValue([{ symbol: 'AAPL', price: 1, ts: 2 }]);

      const out = await service.getWatchlistPrices('u1');
      expect(out.items[0].symbol).toBe('AAPL');
    });
  });
});
