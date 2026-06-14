import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let sessionSig: ReturnType<typeof signal<{ access_token: string } | null>>;

  beforeEach(() => {
    sessionSig = signal<{ access_token: string } | null>(null);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session: sessionSig } },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('adds Authorization header when session has access_token', () => {
    sessionSig.set({ access_token: 'my-token' });

    http.get('/api/test').subscribe();
    const req = httpMock.expectOne('/api/test');

    expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
    req.flush({});
  });

  it('does not add Authorization header when session is null', () => {
    http.get('/api/test').subscribe();
    const req = httpMock.expectOne('/api/test');

    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('preserves existing headers when adding Authorization', () => {
    sessionSig.set({ access_token: 'tok' });

    http.get('/api/test', { headers: { 'X-Custom': 'value' } }).subscribe();
    const req = httpMock.expectOne('/api/test');

    expect(req.request.headers.get('X-Custom')).toBe('value');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    req.flush({});
  });
});
