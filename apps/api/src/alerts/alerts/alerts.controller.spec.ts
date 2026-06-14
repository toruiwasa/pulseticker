jest.mock('../../auth/supabase-auth.guard', () => ({ SupabaseAuthGuard: class {} }));

import { BadRequestException } from '@nestjs/common';
import * as schemas from '@pulseticker/schemas';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import type { AuthedRequest } from '../../common/types/authed-request';

function authedReq(userId = 'u1'): AuthedRequest {
  return { user: { userId, email: 'x@y.com' } } as AuthedRequest;
}

describe('AlertsController', () => {
  let controller: AlertsController;
  let service: jest.Mocked<AlertsService>;

  beforeEach(() => {
    service = {
      getAlerts: jest.fn(),
      createAlert: jest.fn(),
      deleteAlert: jest.fn(),
    } as unknown as jest.Mocked<AlertsService>;
    controller = new AlertsController(service);
  });

  describe('GET /alerts', () => {
    it('delegates to getAlerts with userId', () => {
      controller.getAlerts(authedReq('u42'));
      expect(service.getAlerts).toHaveBeenCalledWith('u42');
    });
  });

  describe('POST /alerts — validation', () => {
    const validBody = { symbol: 'AAPL', threshold_price: 150, direction: 'above' };

    it('throws BadRequestException when symbol is missing', () => {
      expect(() =>
        controller.createAlert(authedReq(), { ...validBody, symbol: '' }),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when symbol is undefined', () => {
      const body = { threshold_price: 150, direction: 'above' };
      expect(() => controller.createAlert(authedReq(), body)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when threshold_price is 0', () => {
      expect(() =>
        controller.createAlert(authedReq(), { ...validBody, threshold_price: 0 }),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when threshold_price is negative', () => {
      expect(() =>
        controller.createAlert(authedReq(), { ...validBody, threshold_price: -1 }),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException when threshold_price is missing', () => {
      const body = { symbol: 'AAPL', direction: 'above' };
      expect(() => controller.createAlert(authedReq(), body)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when direction is invalid', () => {
      expect(() =>
        controller.createAlert(authedReq(), { ...validBody, direction: 'sideways' }),
      ).toThrow(BadRequestException);
    });

    it('normalizes symbol to uppercase and trims whitespace', () => {
      service.createAlert.mockResolvedValue(undefined as never);
      controller.createAlert(authedReq('u1'), { symbol: '  aapl  ', threshold_price: 150, direction: 'above' });
      expect(service.createAlert).toHaveBeenCalledWith('u1', 'AAPL', 150, 'above');
    });

    it('delegates to createAlert with valid body', () => {
      service.createAlert.mockResolvedValue(undefined as never);
      controller.createAlert(authedReq('u1'), validBody);
      expect(service.createAlert).toHaveBeenCalledWith('u1', 'AAPL', 150, 'above');
    });

    it('re-throws non-ZodError exceptions from the schema parse', () => {
      const boom = new Error('unexpected');
      jest.spyOn(schemas.CreateAlertSchema, 'parse').mockImplementation(() => { throw boom; });
      expect(() => controller.createAlert(authedReq(), validBody)).toThrow(boom);
      jest.restoreAllMocks();
    });
  });

  describe('DELETE /alerts/:id', () => {
    it('delegates to deleteAlert with userId and id', () => {
      controller.deleteAlert(authedReq('u42'), 'alert-id-1');
      expect(service.deleteAlert).toHaveBeenCalledWith('u42', 'alert-id-1');
    });
  });
});
