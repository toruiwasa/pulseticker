import { ChartService } from './chart.service';
import { FinnhubService } from '../finnhub/finnhub/finnhub.service';

jest.mock('@pulseticker/trading-utils', () => ({
  getLastTradingDayOpenUnix: jest.fn(() => 1_700_000_000),
}));

describe('ChartService', () => {
  let service: ChartService;
  let finnhub: jest.Mocked<FinnhubService>;
  const realDateNow = Date.now;

  beforeEach(() => {
    finnhub = { getCandles: jest.fn() } as unknown as jest.Mocked<FinnhubService>;
    service = new ChartService(finnhub);
    Date.now = jest.fn(() => 1_700_003_600_000); // 1h after open in ms
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it('maps Finnhub candles into { time, value } points using closing price', async () => {
    finnhub.getCandles.mockResolvedValue({
      s: 'ok',
      t: [1_700_000_000, 1_700_000_060],
      c: [185.5, 186.0],
    });

    const result = await service.getCandles('AAPL');

    expect(finnhub.getCandles).toHaveBeenCalledWith('AAPL', '1', 1_700_000_000, 1_700_003_600);
    expect(result).toEqual([
      { time: 1_700_000_000, value: 185.5 },
      { time: 1_700_000_060, value: 186.0 },
    ]);
  });

  it('returns [] when Finnhub reports no_data', async () => {
    finnhub.getCandles.mockResolvedValue({ s: 'no_data' });
    await expect(service.getCandles('AAPL')).resolves.toEqual([]);
  });

  it('returns [] when Finnhub returns s:"ok" without t/c arrays', async () => {
    finnhub.getCandles.mockResolvedValue({ s: 'ok' });
    await expect(service.getCandles('AAPL')).resolves.toEqual([]);
  });

  it('returns [] and swallows errors when getCandles throws', async () => {
    finnhub.getCandles.mockRejectedValue(new Error('network down'));
    await expect(service.getCandles('AAPL')).resolves.toEqual([]);
  });
});
