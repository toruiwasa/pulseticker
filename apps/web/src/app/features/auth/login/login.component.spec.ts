import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { PreviewService, PREVIEW_SYMBOLS_INITIAL, PreviewPrice } from '../../../core/services/preview.service';
import { LoginComponent } from './login.component';

const mockPrices: PreviewPrice[] = [
  { symbol: 'VOO',     raw: 'VOO',           price: 487.00, percentChange: 0,     ts: 1000 },
  { symbol: 'AAPL',    raw: 'AAPL',          price: 213.42, percentChange: 0.58,  ts: 1000 },
  { symbol: 'MSFT',    raw: 'MSFT',          price: 415.10, percentChange: -0.55, ts: 1000 },
  { symbol: 'AUD/USD', raw: 'OANDA:AUD_USD', price: 0.6423, percentChange: 0.12,  ts: 1000 },
];

describe('LoginComponent', () => {
  let component: LoginComponent;
  let authSpy: { signInWithGitHub: ReturnType<typeof vi.fn> };
  let previewSpy: { getPriceStream: ReturnType<typeof vi.fn> };
  let prices$: Subject<PreviewPrice[]>;

  beforeEach(async () => {
    authSpy = { signInWithGitHub: vi.fn() };
    prices$ = new Subject();
    previewSpy = { getPriceStream: vi.fn().mockReturnValue(prices$) };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: authSpy },
        { provide: PreviewService, useValue: previewSpy },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initialises with 4 symbols in null state', () => {
    expect(component.prices()).toEqual(PREVIEW_SYMBOLS_INITIAL);
  });

  it('updates prices when stream emits', () => {
    prices$.next(mockPrices);
    expect(component.prices()).toEqual(mockPrices);
  });

  it('login() calls auth.signInWithGitHub()', () => {
    component.login();
    expect(authSpy.signInWithGitHub).toHaveBeenCalled();
  });

  it('unsubscribes from stream on destroy', () => {
    const sub = component['sub']!;
    const spy = vi.spyOn(sub, 'unsubscribe');
    component.ngOnDestroy();
    expect(spy).toHaveBeenCalled();
  });

  describe('changeClass()', () => {
    it('returns "positive" for pct > 0', () => expect(component.changeClass(0.5)).toBe('positive'));
    it('returns "negative" for pct < 0', () => expect(component.changeClass(-0.5)).toBe('negative'));
    it('returns "neutral" for pct === 0', () => expect(component.changeClass(0)).toBe('neutral'));
    it('returns "neutral" for null', () => expect(component.changeClass(null)).toBe('neutral'));
  });

  describe('formatChange()', () => {
    it('returns "---" for null', () => expect(component.formatChange(null)).toBe('---'));
    it('includes ▲ and + for positive', () => {
      const s = component.formatChange(1.23);
      expect(s).toContain('▲');
      expect(s).toContain('+');
    });
    it('includes ▼ for negative', () => expect(component.formatChange(-0.55)).toContain('▼'));
    it('includes — for zero', () => expect(component.formatChange(0)).toContain('—'));
  });
});
