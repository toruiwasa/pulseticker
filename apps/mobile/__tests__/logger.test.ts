/**
 * Boundary: the only permitted console caller. Three guarantees are tested —
 * the level gate per APP_ENV, that sanitize() actually runs on the data
 * argument (not merely that the call looked right), and that the *WithCause
 * helpers keep err.message out of staging and production.
 */
import type { AppEnv } from '../src/lib/config';

import { mockConfig } from './helpers/mockConfig';

function loadLogger(appEnv: AppEnv) {
  let loaded: typeof import('../src/lib/logger') | undefined;
  jest.isolateModules(() => {
    jest.doMock('../src/lib/config', () => ({ Config: mockConfig(appEnv) }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../src/lib/logger');
  });
  return loaded!.MobileLogger;
}

const spies = {
  debug: jest.spyOn(console, 'debug').mockImplementation(() => {}),
  info: jest.spyOn(console, 'info').mockImplementation(() => {}),
  warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
  error: jest.spyOn(console, 'error').mockImplementation(() => {}),
};

beforeEach(() => {
  Object.values(spies).forEach((spy) => spy.mockClear());
});

afterEach(() => {
  jest.resetModules();
  jest.dontMock('../src/lib/config');
});

afterAll(() => {
  Object.values(spies).forEach((spy) => spy.mockRestore());
});

describe('MobileLogger level gate', () => {
  it('emits every level in development', () => {
    const logger = loadLogger('development');

    logger.debug('AUTH', 'a');
    logger.info('AUTH', 'b');
    logger.warn('AUTH', 'c');
    logger.error('AUTH', 'd');

    expect(spies.debug).toHaveBeenCalledTimes(1);
    expect(spies.info).toHaveBeenCalledTimes(1);
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it('drops debug but keeps info in staging', () => {
    const logger = loadLogger('staging');

    logger.debug('AUTH', 'a');
    logger.info('AUTH', 'b');

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).toHaveBeenCalledTimes(1);
  });

  it('drops debug and info in production, keeps warn and error', () => {
    const logger = loadLogger('production');

    logger.debug('AUTH', 'a');
    logger.info('AUTH', 'b');
    logger.warn('AUTH', 'c');
    logger.error('AUTH', 'd');

    expect(spies.debug).not.toHaveBeenCalled();
    expect(spies.info).not.toHaveBeenCalled();
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });
});

describe('MobileLogger data handling', () => {
  it('redacts tokens and PII through sanitize()', () => {
    const logger = loadLogger('development');

    logger.debug('AUTH', 'signed in', {
      access_token: 'never-log-me',
      refresh_token: 'nor-this',
      email: 'user@example.com',
      hasSession: true,
    });

    expect(spies.debug).toHaveBeenCalledWith('[AUTH]', 'signed in', {
      access_token: '[REDACTED]',
      refresh_token: '[REDACTED]',
      email: '[REDACTED]',
      hasSession: true,
    });
  });

  it('redacts at warn and error too — the levels production still emits', () => {
    const logger = loadLogger('production');

    logger.warn('AUTH', 'refresh failed', { access_token: 'never-log-me' });
    logger.error('AUTH', 'fatal', { refresh_token: 'never-log-me' });

    expect(spies.warn).toHaveBeenCalledWith('[AUTH]', 'refresh failed', {
      access_token: '[REDACTED]',
    });
    expect(spies.error).toHaveBeenCalledWith('[AUTH]', 'fatal', {
      refresh_token: '[REDACTED]',
    });
  });

  it('redacts a listed key at any depth, not only the top level', () => {
    const logger = loadLogger('production');

    logger.warn('AUTH', 'refresh failed', {
      context: { access_token: 'never-log-me', inner: { refresh_token: 'nor-this' } },
      hasSession: true,
    });

    expect(spies.warn).toHaveBeenCalledWith('[AUTH]', 'refresh failed', {
      context: { access_token: '[REDACTED]', inner: { refresh_token: '[REDACTED]' } },
      hasSession: true,
    });
  });

  it('redacts through arrays', () => {
    const logger = loadLogger('production');

    logger.warn('AUTH', 'batch', {
      sessions: [{ access_token: 'one' }, { access_token: 'two' }],
    });

    expect(spies.warn).toHaveBeenCalledWith('[AUTH]', 'batch', {
      sessions: [{ access_token: '[REDACTED]' }, { access_token: '[REDACTED]' }],
    });
  });

  it('terminates on a circular structure instead of overflowing the stack', () => {
    const logger = loadLogger('production');
    const cycle: Record<string, unknown> = { access_token: 'never-log-me' };
    cycle['self'] = cycle;

    logger.warn('AUTH', 'cyclic', { cycle });

    expect(spies.warn).toHaveBeenCalledWith('[AUTH]', 'cyclic', {
      cycle: { access_token: '[REDACTED]', self: '[CIRCULAR]' },
    });
  });

  it('leaves a non-plain object alone rather than serialising it to {}', () => {
    const logger = loadLogger('production');
    const when = new Date('2026-01-01T00:00:00.000Z');

    logger.warn('CACHE', 'evicted', { when });

    expect(spies.warn).toHaveBeenCalledWith('[CACHE]', 'evicted', { when });
  });

  it('passes no data argument at all when none was given', () => {
    const logger = loadLogger('development');

    logger.info('NAV', 'navigating to /dashboard');

    expect(spies.info).toHaveBeenCalledWith('[NAV]', 'navigating to /dashboard');
  });
});

describe('MobileLogger *WithCause', () => {
  const tokenBearingError = () => new TypeError('rejected token eyJhbGciOiJIUzI1NiJ9.abc');

  it('includes errorMessage and a stack in development', () => {
    const logger = loadLogger('development');

    logger.errorWithCause('AUTH', 'verify failed', tokenBearingError(), { hasSession: false });

    expect(spies.error).toHaveBeenCalledWith(
      '[AUTH]',
      'verify failed',
      expect.objectContaining({
        errorName: 'TypeError',
        errorMessage: 'rejected token eyJhbGciOiJIUzI1NiJ9.abc',
        hasSession: false,
      })
    );
    expect(spies.error.mock.calls[0]?.[2]).toHaveProperty('errorStack');
  });

  it('records only errorName in production — err.message may carry a token', () => {
    const logger = loadLogger('production');

    logger.errorWithCause('AUTH', 'verify failed', tokenBearingError());

    expect(spies.error).toHaveBeenCalledWith('[AUTH]', 'verify failed', {
      errorName: 'TypeError',
    });
  });

  it('omits the stack from warnWithCause even in development', () => {
    const logger = loadLogger('development');

    logger.warnWithCause('AUTH', 'retrying', new Error('boom'));

    expect(spies.warn).toHaveBeenCalledWith('[AUTH]', 'retrying', {
      errorName: 'Error',
      errorMessage: 'boom',
    });
  });

  it('obeys the level gate — warnWithCause is silent at no level, errorWithCause never is', () => {
    const logger = loadLogger('production');

    logger.warnWithCause('AUTH', 'a', new Error('boom'));
    logger.errorWithCause('AUTH', 'b', new Error('boom'));

    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });
});
