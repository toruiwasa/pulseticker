import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of } from 'rxjs';
import { SymbolSearchInputComponent } from './symbol-search-input.component';
import { ApiService } from '../services/api.service';

const mockResults = [
  { symbol: 'AAPL', description: 'Apple Inc.' },
  { symbol: 'AMZN', description: 'Amazon.com' },
];

describe('SymbolSearchInputComponent (class logic)', () => {
  let component: SymbolSearchInputComponent;
  let apiStub: { searchSymbols: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    apiStub = { searchSymbols: vi.fn().mockReturnValue(of(mockResults)) };
    component = new SymbolSearchInputComponent(apiStub as unknown as ApiService);
    component.ngOnInit();
  });

  afterEach(() => {
    component.ngOnDestroy();
    vi.useRealTimers();
  });

  // Simulate typing into the input by calling onInput with a mock event target
  function fireInput(value: string) {
    component.onInput({ target: { value } } as unknown as Event);
  }

  describe('debounced search', () => {
    it('does not call API before the 300 ms debounce interval', () => {
      fireInput('AP');
      expect(apiStub.searchSymbols).not.toHaveBeenCalled();
    });

    it('calls API once after 300 ms, with only the latest typed value', () => {
      fireInput('AP');
      fireInput('APP');
      fireInput('AAPL');
      vi.advanceTimersByTime(300);
      expect(apiStub.searchSymbols).toHaveBeenCalledTimes(1);
      expect(apiStub.searchSymbols).toHaveBeenCalledWith('AAPL');
    });

    it('populates results signal after API response', () => {
      fireInput('AAPL');
      vi.advanceTimersByTime(300);
      expect(component.results()).toEqual(mockResults);
    });

    it('clears results and skips API for empty input', () => {
      fireInput('AAPL');
      vi.advanceTimersByTime(300);
      fireInput('');
      vi.advanceTimersByTime(300);
      expect(component.results()).toEqual([]);
      // API was called for 'AAPL' but not for the empty string
      expect(apiStub.searchSymbols).toHaveBeenCalledTimes(1);
    });

    it('does not call API twice for the same value (distinctUntilChanged)', () => {
      fireInput('AAPL');
      vi.advanceTimersByTime(300);
      fireInput('AAPL');
      vi.advanceTimersByTime(300);
      expect(apiStub.searchSymbols).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard navigation', () => {
    beforeEach(() => {
      component.results.set(mockResults); // 2 items: index 0 and 1
      component.activeIndex.set(-1);
    });

    it('ArrowDown increments activeIndex from -1 to 0', () => {
      component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.activeIndex()).toBe(0);
    });

    it('ArrowDown does not exceed the last item index', () => {
      component.activeIndex.set(1);
      component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      expect(component.activeIndex()).toBe(1);
    });

    it('ArrowUp decrements activeIndex', () => {
      component.activeIndex.set(1);
      component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(component.activeIndex()).toBe(0);
    });

    it('ArrowUp does not go below 0', () => {
      component.activeIndex.set(0);
      component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
      expect(component.activeIndex()).toBe(0);
    });

    it('Enter emits symbolSelected for the active item', () => {
      const emitted: string[] = [];
      component.symbolSelected.subscribe(s => emitted.push(s));
      component.activeIndex.set(0);
      component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(emitted).toEqual(['AAPL']);
    });

    it('Enter does nothing when no item is active (index -1)', () => {
      const emitted: string[] = [];
      component.symbolSelected.subscribe(s => emitted.push(s));
      component.activeIndex.set(-1);
      component.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(emitted).toHaveLength(0);
    });

    it('Escape clears search query and results', () => {
      component.searchQuery.set('AAPL');
      component.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.searchQuery()).toBe('');
      expect(component.results()).toEqual([]);
    });
  });

  describe('select()', () => {
    it('emits symbolSelected with the raw symbol string', () => {
      const emitted: string[] = [];
      component.symbolSelected.subscribe(s => emitted.push(s));
      component.select('AAPL');
      expect(emitted).toEqual(['AAPL']);
    });

    it('sets searchQuery to the symbol when clearOnSelect is false', () => {
      component.clearOnSelect = false;
      component.select('AAPL');
      expect(component.searchQuery()).toBe('AAPL');
    });

    it('converts OANDA symbol to display form (AUD_USD → AUD/USD)', () => {
      component.clearOnSelect = false;
      component.select('OANDA:AUD_USD');
      expect(component.searchQuery()).toBe('AUD/USD');
    });

    it('clears searchQuery when clearOnSelect is true', () => {
      component.clearOnSelect = true;
      component.searchQuery.set('something');
      component.select('AAPL');
      expect(component.searchQuery()).toBe('');
    });

    it('clears the dropdown results after selection', () => {
      component.results.set(mockResults);
      component.clearOnSelect = false;
      component.select('AAPL');
      expect(component.results()).toEqual([]);
    });
  });
});
