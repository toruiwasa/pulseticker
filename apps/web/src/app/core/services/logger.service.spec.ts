import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    TestBed.configureTestingModule({ providers: [LoggerService] });
    service = TestBed.inject(LoggerService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('log level filtering', () => {
    it('debug() calls console.debug when logLevel allows it', () => {
      // environment.ts has logLevel: 'debug'
      service.debug('CTX', 'hello');
      expect(console.debug).toHaveBeenCalledOnce();
    });

    it('debug() is suppressed when minLevel is raised to warn', () => {
      (service as unknown as { minLevel: number }).minLevel = 2; // LEVELS['warn']
      service.debug('CTX', 'hello');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('warn() is always called regardless of minLevel', () => {
      service.warn('CTX', 'warning');
      expect(console.warn).toHaveBeenCalledOnce();
    });

    it('error() is always called', () => {
      service.error('CTX', 'err');
      expect(console.error).toHaveBeenCalledOnce();
    });

    it('info() is suppressed when minLevel is error', () => {
      (service as unknown as { minLevel: number }).minLevel = 3; // LEVELS['error']
      service.info('CTX', 'info');
      expect(console.info).not.toHaveBeenCalled();
    });
  });

  describe('sanitize() integration', () => {
    it('replaces REDACTED_KEYS values with "[REDACTED]"', () => {
      service.warn('CTX', 'msg', { access_token: 'secret', visible: 'ok' });
      const args = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0];
      const data = args[2] as Record<string, unknown>;
      expect(data['access_token']).toBe('[REDACTED]');
      expect(data['visible']).toBe('ok');
    });

    it('does not redact non-sensitive keys', () => {
      service.warn('CTX', 'msg', { symbol: 'AAPL', price: 150 });
      const args = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0];
      const data = args[2] as Record<string, unknown>;
      expect(data['symbol']).toBe('AAPL');
      expect(data['price']).toBe(150);
    });
  });

  describe('warnWithCause()', () => {
    it('includes errorName in log data', () => {
      const err = Object.assign(new Error('detail'), { name: 'AuthApiError' });
      service.warnWithCause('CTX', 'failed', err);
      const args = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0];
      const data = args[2] as Record<string, unknown>;
      expect(data['errorName']).toBe('AuthApiError');
    });

    it('includes errorMessage in development environment', () => {
      // environment.ts has appEnv: 'development'
      const err = new Error('secret-detail');
      service.warnWithCause('CTX', 'failed', err);
      const args = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0];
      const data = args[2] as Record<string, unknown>;
      expect(data['errorMessage']).toBe('secret-detail');
    });
  });

  describe('errorWithCause()', () => {
    it('calls console.error with errorName', () => {
      const err = Object.assign(new Error('boom'), { name: 'NetworkError' });
      service.errorWithCause('CTX', 'failed', err);
      expect(console.error).toHaveBeenCalledOnce();
      const args = (console.error as ReturnType<typeof vi.spyOn>).mock.calls[0];
      const data = args[2] as Record<string, unknown>;
      expect(data['errorName']).toBe('NetworkError');
    });
  });
});
