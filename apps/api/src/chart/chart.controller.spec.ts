jest.mock('../auth/supabase-auth.guard', () => ({ SupabaseAuthGuard: class {} }));

import { BadRequestException } from '@nestjs/common';
import { ChartController } from './chart.controller.js';
import { ChartService } from './chart.service.js';

describe('ChartController', () => {
  let controller: ChartController;
  let service: jest.Mocked<ChartService>;

  beforeEach(() => {
    service = { getCandles: jest.fn() } as unknown as jest.Mocked<ChartService>;
    controller = new ChartController(service);
  });

  describe('GET /chart/candles', () => {
    it('defaults range to 1D and forwards the trimmed symbol', () => {
      service.getCandles.mockResolvedValue([{ time: 1, value: 10 }]);
      controller.candles('  AAPL  ');
      expect(service.getCandles).toHaveBeenCalledWith('AAPL', '1D');
    });

    it('accepts an explicit supported range', () => {
      controller.candles('AAPL', '1Y');
      expect(service.getCandles).toHaveBeenCalledWith('AAPL', '1Y');
    });

    it('returns the service result', async () => {
      const data = [{ time: 1, value: 10 }];
      service.getCandles.mockResolvedValue(data);
      await expect(controller.candles('AAPL')).resolves.toBe(data);
    });

    it('throws BadRequestException when symbol is missing', () => {
      expect(() => controller.candles('')).toThrow(BadRequestException);
      expect(() => controller.candles('   ')).toThrow(BadRequestException);
      expect(() => controller.candles(undefined as unknown as string)).toThrow(BadRequestException);
    });

    it('rejects reserved-but-not-yet-implemented ranges with BadRequestException', () => {
      for (const r of ['1W', '1M', '3M', '6M', '5Y', 'MAX']) {
        expect(() => controller.candles('AAPL', r)).toThrow(BadRequestException);
      }
    });

    it('rejects unknown ranges with BadRequestException', () => {
      expect(() => controller.candles('AAPL', '42Z')).toThrow(BadRequestException);
    });
  });
});
