import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SymbolSearchService } from './symbol-search.service.js';

describe('SymbolSearchService', () => {
  let service: SymbolSearchService;
  let fetchMock: jest.SpyInstance;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        SymbolSearchService,
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue('test-key') } },
      ],
    }).compile();
    service = moduleRef.get(SymbolSearchService);
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
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

    it('returns no FX matches when the query has no searchable tokens', async () => {
      mockForexSymbol();
      mockSearch([]);
      await expect(service.searchSymbols('/')).resolves.toEqual([]);
    });

    it('does not refetch OANDA cache on subsequent calls', async () => {
      mockForexSymbol();
      mockSearch([]);
      await service.searchSymbols('JPY');
      mockSearch([]);
      await service.searchSymbols('AUD');
      const forexCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/forex/symbol'));
      expect(forexCalls.length).toBe(1);
    });

    it('degrades gracefully when /forex/symbol returns 403 (paid-tier)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as never);
      mockSearch([{ symbol: 'AAPL', description: 'Apple Inc', type: 'Common Stock' }]);
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
});
