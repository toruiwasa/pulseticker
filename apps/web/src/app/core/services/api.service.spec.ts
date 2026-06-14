import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';

// environment.ts apiUrl is 'http://localhost:3000'
const BASE = 'http://localhost:3000';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('searchSymbols()', () => {
    it('sends GET to /watchlist/search with URL-encoded query', () => {
      const data = [{ symbol: 'AAPL', description: 'Apple Inc.' }];
      service.searchSymbols('AAPL').subscribe(r => expect(r).toEqual(data));
      const req = httpMock.expectOne(`${BASE}/watchlist/search?q=AAPL`);
      expect(req.request.method).toBe('GET');
      req.flush(data);
    });
  });

  describe('getQuote()', () => {
    it('sends GET to /watchlist/quote with encoded symbol', () => {
      const quote = { c: 150, pc: 148, t: 1000 };
      service.getQuote('AAPL').subscribe(r => expect(r).toEqual(quote));
      const req = httpMock.expectOne(`${BASE}/watchlist/quote?symbol=AAPL`);
      expect(req.request.method).toBe('GET');
      req.flush(quote);
    });
  });

  describe('getCandles()', () => {
    it('sends GET to /chart/candles with symbol and range', () => {
      service.getCandles('MSFT', '1Y').subscribe();
      const req = httpMock.expectOne(`${BASE}/chart/candles?symbol=MSFT&range=1Y`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });

    it('defaults range to "1D" when not specified', () => {
      service.getCandles('MSFT').subscribe();
      const req = httpMock.expectOne(`${BASE}/chart/candles?symbol=MSFT&range=1D`);
      req.flush([]);
    });
  });

  describe('getMarketStatus()', () => {
    it('sends GET to /market/status', () => {
      service.getMarketStatus().subscribe();
      const req = httpMock.expectOne(`${BASE}/market/status`);
      expect(req.request.method).toBe('GET');
      req.flush({ isOpen: true, timestamp: '' });
    });
  });

  describe('getCompanyProfile()', () => {
    it('sends GET to /company/profile', () => {
      service.getCompanyProfile('AAPL').subscribe();
      const req = httpMock.expectOne(`${BASE}/company/profile?symbol=AAPL`);
      req.flush({});
    });
  });

  describe('generic post()', () => {
    it('sends POST with JSON body', () => {
      const body = { symbol: 'AAPL', threshold_price: 200, direction: 'above' };
      service.post('/alerts', body).subscribe();
      const req = httpMock.expectOne(`${BASE}/alerts`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush({ id: '1', ...body });
    });
  });

  describe('generic delete()', () => {
    it('sends DELETE request', () => {
      service.delete('/alerts/abc').subscribe();
      const req = httpMock.expectOne(`${BASE}/alerts/abc`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });
});
