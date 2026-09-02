/**
 * Boundary: the only permitted console caller. Two guarantees are tested —
 * the level gate per APP_ENV, and that sanitize() actually runs on the data
 * argument (not merely that the call looked right).
 */
type AppEnv = 'development' | 'staging' | 'production';

function loadLogger(appEnv: AppEnv) {
  let loaded: typeof import('../src/lib/logger') | undefined;
  jest.isolateModules(() => {
    jest.doMock('../src/lib/config', () => ({
      Config: {
        supabaseUrl: 'https://project.supabase.co',
        supabasePublishableKey: 'sb_publishable_test',
        apiUrl: 'https://api.example.com',
        appEnv,
      },
    }));
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

  it('passes no data argument at all when none was given', () => {
    const logger = loadLogger('development');

    logger.info('NAV', 'navigating to /dashboard');

    expect(spies.info).toHaveBeenCalledWith('[NAV]', 'navigating to /dashboard');
  });
});
