import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { AlertsComponent } from './alerts.component';
import { ApiService } from '../../core/services/api.service';
import { SymbolSearchInputComponent } from '../../core/components/symbol-search-input.component';

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
  let symbolSearchStub: { clear: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    apiStub = {
      get:    vi.fn().mockReturnValue(of([])),
      post:   vi.fn(),
      delete: vi.fn(),
    };
    symbolSearchStub = { clear: vi.fn() };

    component = new AlertsComponent(apiStub as unknown as ApiService);
    // Wire up @ViewChild manually — Angular doesn't set it without template rendering
    component['symbolSearch'] = symbolSearchStub as unknown as SymbolSearchInputComponent;
    component.ngOnInit();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('isFormValid', () => {
    it('is false when symbol is empty', () => {
      component.form = { symbol: '', threshold_price: 100, direction: 'above' };
      expect(component.isFormValid).toBe(false);
    });

    it('is false when threshold_price is zero', () => {
      component.form = { symbol: 'AAPL', threshold_price: 0, direction: 'above' };
      expect(component.isFormValid).toBe(false);
    });

    it('is false when threshold_price is negative', () => {
      component.form = { symbol: 'AAPL', threshold_price: -10, direction: 'above' };
      expect(component.isFormValid).toBe(false);
    });

    it('is true with a valid symbol and positive price', () => {
      component.form = { symbol: 'AAPL', threshold_price: 150, direction: 'above' };
      expect(component.isFormValid).toBe(true);
    });

    it('is true for lowercase symbol (schema uppercases before validating)', () => {
      component.form = { symbol: 'aapl', threshold_price: 150, direction: 'above' };
      expect(component.isFormValid).toBe(true);
    });
  });

  describe('selectSymbol()', () => {
    it('sets form.symbol to the selected symbol', () => {
      component.selectSymbol('GOOG');
      expect(component.form.symbol).toBe('GOOG');
    });
  });

  describe('ngOnInit()', () => {
    it('loads alerts from GET /alerts and sets loading to false', () => {
      const alerts = [makeAlert()];
      apiStub.get.mockReturnValue(of(alerts));
      component.ngOnInit();
      expect(component.alerts()).toEqual(alerts);
      expect(component.loading()).toBe(false);
    });
  });

  describe('createAlert()', () => {
    beforeEach(() => {
      component.form = { symbol: 'AAPL', threshold_price: 200, direction: 'above' };
    });

    it('does nothing when form is invalid', async () => {
      component.form = { symbol: '', threshold_price: 0, direction: 'above' };
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

    it('resets form to defaults after success', async () => {
      apiStub.post.mockReturnValue(of(makeAlert()));
      await component.createAlert();
      expect(component.form.symbol).toBe('');
      expect(component.form.threshold_price).toBe(0);
      expect(component.form.direction).toBe('above');
    });

    it('calls symbolSearch.clear() after success', async () => {
      apiStub.post.mockReturnValue(of(makeAlert()));
      await component.createAlert();
      expect(symbolSearchStub.clear).toHaveBeenCalledOnce();
    });
  });

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
