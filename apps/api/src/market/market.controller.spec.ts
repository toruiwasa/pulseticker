import { Test } from '@nestjs/testing';
import { MarketController } from './market.controller.js';

describe('MarketController', () => {
  let controller: MarketController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [MarketController],
    }).compile();
    controller = module.get(MarketController);
  });

  describe('status', () => {
    it('returns isOpen boolean and ISO timestamp', () => {
      const result = controller.status();
      expect(typeof result.isOpen).toBe('boolean');
      expect(typeof result.timestamp).toBe('string');
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
