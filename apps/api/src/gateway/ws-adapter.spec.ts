import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server } from 'socket.io';
import { WsAdapter } from './ws-adapter.js';

function makeApp(origin: string): INestApplication {
  const config = { getOrThrow: jest.fn().mockReturnValue(origin) } as unknown as ConfigService;
  return { get: jest.fn().mockReturnValue(config) } as unknown as INestApplication;
}

describe('WsAdapter', () => {
  it('reads CORS_ORIGIN from ConfigService', () => {
    const adapter = new WsAdapter(makeApp('http://expected.test'));
    expect(adapter.corsOrigin).toBe('http://expected.test');
  });

  it('passes cors origin and provided options to super.createIOServer', () => {
    const spy = jest.spyOn(IoAdapter.prototype, 'createIOServer').mockReturnValue({} as Server);
    const adapter = new WsAdapter(makeApp('http://origin.test'));
    adapter.createIOServer(3000, { path: '/prices' });
    expect(spy).toHaveBeenCalledWith(3000, { path: '/prices', cors: { origin: 'http://origin.test' } });
    spy.mockRestore();
  });
});
