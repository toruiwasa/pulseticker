import { Test } from '@nestjs/testing';
import { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { SupabaseHealthIndicator } from '../supabase.health';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { check: jest.Mock };
  let supabase: { isHealthy: jest.Mock };
  let memory: { checkHeap: jest.Mock };

  beforeEach(async () => {
    healthService = { check: jest.fn() };
    supabase = { isHealthy: jest.fn() };
    memory = { checkHeap: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthService },
        { provide: SupabaseHealthIndicator, useValue: supabase },
        { provide: MemoryHealthIndicator, useValue: memory },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  describe('check()', () => {
    it('calls health.check() with two indicator functions', () => {
      healthService.check.mockReturnValue({ status: 'ok' });

      controller.check();

      expect(healthService.check).toHaveBeenCalledTimes(1);
      const [indicators] = healthService.check.mock.calls[0];
      expect(indicators).toHaveLength(2);
    });

    it('the first indicator delegates to supabase.isHealthy()', () => {
      healthService.check.mockImplementation((indicators: Array<() => unknown>) => {
        indicators[0]();
        return { status: 'ok' };
      });
      supabase.isHealthy.mockReturnValue({ supabase: { status: 'up' } });

      controller.check();

      expect(supabase.isHealthy).toHaveBeenCalledTimes(1);
    });

    it('the second indicator delegates to memory.checkHeap()', () => {
      healthService.check.mockImplementation((indicators: Array<() => unknown>) => {
        indicators[1]();
        return { status: 'ok' };
      });
      memory.checkHeap.mockReturnValue({ memory_heap: { status: 'up' } });

      controller.check();

      expect(memory.checkHeap).toHaveBeenCalledWith('memory_heap', 200 * 1024 * 1024);
    });

    it('returns the result from HealthCheckService', () => {
      const result = { status: 'ok', info: {}, error: {}, details: {} };
      healthService.check.mockReturnValue(result);

      expect(controller.check()).toBe(result);
    });
  });
});
