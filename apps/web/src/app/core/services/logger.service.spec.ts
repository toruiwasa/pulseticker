import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ENVIRONMENT } from '../environment.token';
import { LoggerService } from './logger.service';

// The generated environment.ts is external input (gitignored, produced from
// the repo-root .env), so specs control it through the ENVIRONMENT token
// instead of asserting against whatever was last generated. logLevel is read
// at construction, appEnv at call time — mutate mockEnv before TestBed.inject
// or before the call respectively.
const mockEnv = { logLevel: 'debug', appEnv: 'development' };

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    mockEnv.logLevel = 'debug';
    mockEnv.appEnv = 'development';
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    TestBed.configureTestingModule({
      providers: [LoggerService, { provide: ENVIRONMENT, useValue: mockEnv }],
    });
    service = TestBed.inject(LoggerService);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('log level filtering', () => {
    it('debug() calls console.debug when logLevel allows it', () => {
      service.debug('CTX', 'hello');
      expect(console.debug).toHaveBeenCalledOnce();
    });

    it('debug() is suppressed when minLevel is raised to warn', () => {
      (service as unknown as { minLevel: number }).minLevel = 2; // LEVELS['warn']
      service.debug('CTX', 'hello');
      expect(console.debug).not.toHaveBeenCalled();
    });

    it('derives minLevel from the injected environment — a leaked real file fails here', () => {
      // The generated file has logLevel 'debug' in development, so only the
      // token override can produce a warn-level logger without poking fields.
      mockEnv.logLevel = 'warn';
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [LoggerService, { provide: ENVIRONMENT, useValue: mockEnv }],
      });
      const raised = TestBed.inject(LoggerService);
      raised.debug('CTX', 'hello');
      expect(console.debug).not.toHaveBeenCalled();
      raised.warn('CTX', 'warning');
      expect(console.warn).toHaveBeenCalledOnce();
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
      const err = new Error('secret-detail');
      service.warnWithCause('CTX', 'failed', err);
      const args = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0];
      const data = args[2] as Record<string, unknown>;
      expect(data['errorMessage']).toBe('secret-detail');
    });

    it('omits errorMessage when appEnv is production', () => {
      // Previously unreachable: CI pinned APP_ENV=development to keep this
      // suite green, so the production branch of withCause was never exercised.
      mockEnv.appEnv = 'production';
      const err = Object.assign(new Error('secret-detail'), { name: 'AuthApiError' });
      service.warnWithCause('CTX', 'failed', err);
      const args = (console.warn as ReturnType<typeof vi.spyOn>).mock.calls[0];
      const data = args[2] as Record<string, unknown>;
      expect(data['errorMessage']).toBeUndefined();
      expect(data['errorName']).toBe('AuthApiError');
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
