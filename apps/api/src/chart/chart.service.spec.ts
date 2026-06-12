import { ChartService } from './chart.service';
import { LiveCandleCacheService } from './live-candle-cache.service';

describe('ChartService', () => {
  let cache: jest.Mocked<LiveCandleCacheService>;
  let service: ChartService;

  beforeEach(() => {
    cache = { getCandles: jest.fn() } as unknown as jest.Mocked<LiveCandleCacheService>;
    service = new ChartService(cache);
  });

  it('delegates to LiveCandleCacheService.getCandles with the requested range', async () => {
    const data = [{ time: 1, value: 10 }];
    cache.getCandles.mockResolvedValue(data);

    await expect(service.getCandles('AAPL', '1D')).resolves.toBe(data);
    expect(cache.getCandles).toHaveBeenCalledWith('AAPL', '1D');

    await service.getCandles('AAPL', '1Y');
    expect(cache.getCandles).toHaveBeenLastCalledWith('AAPL', '1Y');
  });
});
