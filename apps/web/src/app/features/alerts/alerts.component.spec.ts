import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { AlertsComponent } from './alerts.component';
import { ApiService } from '../../core/services/api.service';
import { LoggerService } from '../../core/services/logger.service';
import { SymbolSearchInputComponent } from '../../core/components/symbol-search-input.component';
import { SymbolMetadataService } from '../../core/services/symbol-metadata.service';

interface Alert {
  id: string;
  symbol: string;
  threshold_price: number;
  direction: 'above' | 'below';
  is_active: boolean;
  created_at: string;
}

function makeAlert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'a1', symbol: 'AAPL', threshold_price: 200,
    direction: 'above', is_active: true, created_at: '2024-01-01',
    ...overrides,
  };
}

describe('AlertsComponent (class logic)', () => {
  let component: AlertsComponent;
  let apiStub: {
    get:    ReturnType<typeof vi.fn>;
    post:   ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let loggerStub: { debug: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let symbolSearchStub: { clear: ReturnType<typeof vi.fn> };
  let metaStub: { currencies: ReturnType<typeof signal<Record<string, string>>>; ensureCurrency: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    apiStub = {
      get:    vi.fn().mockReturnValue(of([])),
      post:   vi.fn(),
      delete: vi.fn(),
    };
    loggerStub = { debug: vi.fn(), error: vi.fn() };
    symbolSearchStub = { clear: vi.fn() };
    metaStub = { currencies: signal({}), ensureCurrency: vi.fn() };

    component = new AlertsComponent(
      apiStub as unknown as ApiService,
      loggerStub as unknown as LoggerService,
      metaStub as unknown as SymbolMetadataService,
    );
    // Wire up @ViewChild manually — Angular doesn't set it without template rendering
    component['symbolSearch'] = symbolSearchStub as unknown as SymbolSearchInputComponent;
    component.ngOnInit();
  });

  afterEach(() => vi.restoreAllMocks());

  // ── isFormValid (computed signal) ────────────────────────────────────────────
  // Equivalence partitioning:
  //   EC-1 Valid:   symbol non-empty + price > 0 + direction in enum
  //   EC-2 Invalid: symbol empty
  //   EC-3 Invalid: price ≤ 0 or null
  //   EC-4 Invalid: symbol too long (> 50 chars)
  // Boundary values tested at the edges of each partition.

  describe('isFormValid (equivalence partitions + boundary values)', () => {

    // ── EC-1: Valid cases ─────────────────────────────────────────────────────

    it('EC-1 / BV: valid — typical stock symbol and positive price', () => {
      component.symbol.set('AAPL');
      component.price.set(150);
      expect(component.isFormValid()).toBe(true);
    });

    it('EC-1 / BV: valid — boundary price just above zero (0.0001)', () => {
      component.symbol.set('AAPL');
      component.price.set(0.0001);
      expect(component.isFormValid()).toBe(true);
    });

    it('EC-1 / BV: valid — symbol at max length (50 chars)', () => {
      component.symbol.set('A'.repeat(50));
      component.price.set(1);
      expect(component.isFormValid()).toBe(true);
    });

    it('EC-1 / BV: valid — symbol at min length (1 char)', () => {
      component.symbol.set('A');
      component.price.set(1);
      expect(component.isFormValid()).toBe(true);
    });

    it('EC-1: valid — Oanda forex symbol (13 chars, previously broken by max(10))', () => {
      component.symbol.set('OANDA:EUR_USD');
      component.price.set(1.08);
      expect(component.isFormValid()).toBe(true);
    });

    it('EC-1: valid — direction "below"', () => {
      component.symbol.set('AAPL');
      component.price.set(100);
      component.direction.set('below');
      expect(component.isFormValid()).toBe(true);
    });

    it('EC-1: valid — lowercase symbol (schema uppercases via transform)', () => {
      component.symbol.set('aapl');
      component.price.set(150);
      expect(component.isFormValid()).toBe(true);
    });

    // ── EC-2: Empty symbol ────────────────────────────────────────────────────

    it('EC-2: invalid — empty symbol', () => {
      component.symbol.set('');
      component.price.set(150);
      expect(component.isFormValid()).toBe(false);
    });

    it('EC-2 / BV: invalid — whitespace-only symbol (trimmed to empty)', () => {
      component.symbol.set('   ');
      component.price.set(150);
      expect(component.isFormValid()).toBe(false);
    });

    it('EC-2 / EC-3: invalid — both symbol empty and price null', () => {
      component.symbol.set('');
      component.price.set(null);
      expect(component.isFormValid()).toBe(false);
    });

    // ── EC-3: Price ≤ 0 or null ───────────────────────────────────────────────

    it('EC-3 / BV: invalid — price zero (boundary)', () => {
      component.symbol.set('AAPL');
      component.price.set(0);
      expect(component.isFormValid()).toBe(false);
    });

    it('EC-3 / BV: invalid — price just below zero (-0.0001)', () => {
      component.symbol.set('AAPL');
      component.price.set(-0.0001);
      expect(component.isFormValid()).toBe(false);
    });

    it('EC-3: invalid — price negative', () => {
      component.symbol.set('AAPL');
      component.price.set(-100);
      expect(component.isFormValid()).toBe(false);
    });

    it('EC-3: invalid — price null (empty input)', () => {
      component.symbol.set('AAPL');
      component.price.set(null);
      expect(component.isFormValid()).toBe(false);
    });

    // ── EC-4: Symbol too long ─────────────────────────────────────────────────

    it('EC-4 / BV: invalid — symbol 51 chars (one over the max)', () => {
      component.symbol.set('A'.repeat(51));
      component.price.set(1);
      expect(component.isFormValid()).toBe(false);
    });

    it('EC-4: invalid — symbol very long (100 chars)', () => {
      component.symbol.set('X'.repeat(100));
      component.price.set(1);
      expect(component.isFormValid()).toBe(false);
    });
  });

  // ── selectSymbol() ────────────────────────────────────────────────────────

  describe('selectSymbol()', () => {
    it('sets the symbol signal', () => {
      component.selectSymbol('GOOG');
      expect(component.symbol()).toBe('GOOG');
    });
  });

  // ── ngOnInit() ────────────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('loads alerts from GET /alerts and sets loading to false', () => {
      const alerts = [makeAlert()];
      apiStub.get.mockReturnValue(of(alerts));
      component.ngOnInit();
      expect(component.alerts()).toEqual(alerts);
      expect(component.loading()).toBe(false);
    });
  });

  // ── createAlert() ─────────────────────────────────────────────────────────

  describe('createAlert()', () => {
    beforeEach(() => {
      component.symbol.set('AAPL');
      component.price.set(200);
      component.direction.set('above');
    });

    it('does nothing when form is invalid', async () => {
      component.symbol.set('');
      component.price.set(null);
      await component.createAlert();
      expect(apiStub.post).not.toHaveBeenCalled();
    });

    it('calls api.post("/alerts", payload) with valid form', async () => {
      apiStub.post.mockReturnValue(of(makeAlert()));
      await component.createAlert();
      expect(apiStub.post).toHaveBeenCalledWith(
        '/alerts',
        expect.objectContaining({ symbol: 'AAPL', threshold_price: 200, direction: 'above' }),
      );
    });

    it('prepends the new alert to the list', async () => {
      const existing = makeAlert({ id: 'old' });
      component.alerts.set([existing]);
      const newAlert = makeAlert({ id: 'new' });
      apiStub.post.mockReturnValue(of(newAlert));
      await component.createAlert();
      expect(component.alerts()[0].id).toBe('new');
      expect(component.alerts()[1].id).toBe('old');
    });

    it('resets signals to defaults after success', async () => {
      apiStub.post.mockReturnValue(of(makeAlert()));
      await component.createAlert();
      expect(component.symbol()).toBe('');
      expect(component.price()).toBeNull();
      expect(component.direction()).toBe('above');
    });

    it('calls symbolSearch.clear() after success', async () => {
      apiStub.post.mockReturnValue(of(makeAlert()));
      await component.createAlert();
      expect(symbolSearchStub.clear).toHaveBeenCalledOnce();
    });
  });

  // ── deleteAlert() ─────────────────────────────────────────────────────────

  describe('deleteAlert()', () => {
    beforeEach(() => {
      component.alerts.set([makeAlert({ id: 'a1' }), makeAlert({ id: 'a2', symbol: 'GOOG' })]);
    });

    it('calls api.delete("/alerts/:id")', async () => {
      apiStub.delete.mockReturnValue(of(null));
      await component.deleteAlert('a1');
      expect(apiStub.delete).toHaveBeenCalledWith('/alerts/a1');
    });

    it('removes the deleted alert from the list on success', async () => {
      apiStub.delete.mockReturnValue(of(null));
      await component.deleteAlert('a1');
      expect(component.alerts()).toHaveLength(1);
      expect(component.alerts()[0].id).toBe('a2');
    });
  });
});
