import { describe, it, expect, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TUI_DARK_MODE } from '@taiga-ui/core';
import { ThemeService } from './theme.service';

function makeDarkModeMock() {
  let _dark = false;
  const setFn  = vi.fn((v: boolean) => { _dark = v; });
  const resetFn = vi.fn(() => { _dark = false; });
  const mock = Object.assign(
    () => _dark,
    { set: setFn, reset: resetFn, update: vi.fn(), asReadonly: () => () => _dark },
  );
  return { mock, setFn, resetFn };
}

function createService(localStorageValue: string | null = null) {
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(localStorageValue);
  const { mock, setFn, resetFn } = makeDarkModeMock();

  TestBed.configureTestingModule({
    providers: [
      ThemeService,
      { provide: TUI_DARK_MODE, useValue: mock },
    ],
  });

  return { service: TestBed.inject(ThemeService), setFn, resetFn };
}

describe('ThemeService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('initial pref from localStorage', () => {
    it('is "system" when localStorage has no stored value', () => {
      const { service } = createService(null);
      expect(service.pref()).toBe('system');
    });

    it('is "dark" when localStorage tuiDark is "true"', () => {
      const { service } = createService('true');
      expect(service.pref()).toBe('dark');
    });

    it('is "light" when localStorage tuiDark is "false"', () => {
      const { service } = createService('false');
      expect(service.pref()).toBe('light');
    });
  });

  describe('set()', () => {
    it('set("dark") calls darkMode.set(true) and updates pref', () => {
      const { service, setFn } = createService();
      service.set('dark');
      expect(setFn).toHaveBeenCalledWith(true);
      expect(service.pref()).toBe('dark');
    });

    it('set("light") calls darkMode.set(false) and updates pref', () => {
      const { service, setFn } = createService();
      service.set('light');
      expect(setFn).toHaveBeenCalledWith(false);
      expect(service.pref()).toBe('light');
    });

    it('set("system") calls darkMode.reset() and reverts pref to "system"', () => {
      const { service, resetFn } = createService();
      service.set('dark');
      service.set('system');
      expect(resetFn).toHaveBeenCalled();
      expect(service.pref()).toBe('system');
    });
  });

  describe('toggle()', () => {
    it('cycles system → light', () => {
      const { service, setFn } = createService();
      service.toggle();
      expect(setFn).toHaveBeenCalledWith(false);
      expect(service.pref()).toBe('light');
    });

    it('cycles light → dark', () => {
      const { service, setFn } = createService();
      service.set('light');
      vi.clearAllMocks();
      service.toggle();
      expect(setFn).toHaveBeenCalledWith(true);
      expect(service.pref()).toBe('dark');
    });

    it('cycles dark → system', () => {
      const { service, resetFn } = createService();
      service.set('dark');
      vi.clearAllMocks();
      service.toggle();
      expect(resetFn).toHaveBeenCalled();
      expect(service.pref()).toBe('system');
    });
  });
});
