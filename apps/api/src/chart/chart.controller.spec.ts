jest.mock('../auth/supabase-auth.guard', () => ({ SupabaseAuthGuard: class {} }));

import { BadRequestException } from '@nestjs/common';
import { ChartController } from './chart.controller';
import { ChartService } from './chart.service';

describe('ChartController', () => {
  let controller: ChartController;
  let service: jest.Mocked<ChartService>;

  beforeEach(() => {
    service = { getCandles: jest.fn() } as unknown as jest.Mocked<ChartService>;
    controller = new ChartController(service);
  });

  describe('GET /chart/candles', () => {
    it('delegates to chart.getCandles with the trimmed symbol', () => {
      service.getCandles.mockResolvedValue([{ time: 1, value: 10 }]);
      controller.candles('  AAPL  ');
      expect(service.getCandles).toHaveBeenCalledWith('AAPL');
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
  });
});
