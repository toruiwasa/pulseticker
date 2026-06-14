import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { LoggerService } from '../../../core/services/logger.service';
import { CallbackComponent } from './callback.component';

describe('CallbackComponent', () => {
  let authStub:   { exchangeCode: ReturnType<typeof vi.fn> };
  let routerStub: { navigate:     ReturnType<typeof vi.fn> };
  const loggerStub = { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() };

  // Mutate this object inside tests to set query params for each scenario.
  // The ActivatedRoute stub captures a reference, so mutations are visible at call time.
  const queryParams: Record<string, string> = {};

  beforeEach(async () => {
    Object.keys(queryParams).forEach(k => delete queryParams[k]);

    authStub   = { exchangeCode: vi.fn().mockResolvedValue(null) };
    routerStub = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [CallbackComponent],
      providers: [
        { provide: AuthService,   useValue: authStub   },
        { provide: Router,        useValue: routerStub },
        { provide: LoggerService, useValue: loggerStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: { get: (k: string) => queryParams[k] ?? null },
            },
          },
        },
      ],
    }).compileComponents();
  });

  function createAndInit() {
    const fixture = TestBed.createComponent(CallbackComponent);
    return fixture.componentInstance.ngOnInit();
  }

  it('navigates to "/" when no code or error param is present', async () => {
    await createAndInit();
    expect(authStub.exchangeCode).not.toHaveBeenCalled();
    expect(routerStub.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true });
  });

  it('navigates to "/" when OAuth error param is present', async () => {
    queryParams['error'] = 'access_denied';
    await createAndInit();
    expect(routerStub.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true });
  });

  it('calls exchangeCode with the code param', async () => {
    queryParams['code'] = 'auth-code-123';
    await createAndInit();
    expect(authStub.exchangeCode).toHaveBeenCalledWith('auth-code-123');
  });

  it('navigates to "/dashboard" when exchange returns a session', async () => {
    queryParams['code'] = 'auth-code';
    authStub.exchangeCode.mockResolvedValue({ access_token: 'tok' });
    await createAndInit();
    expect(routerStub.navigate).toHaveBeenCalledWith(['/dashboard'], { replaceUrl: true });
  });

  it('navigates to "/" when exchange returns null', async () => {
    queryParams['code'] = 'auth-code';
    authStub.exchangeCode.mockResolvedValue(null);
    await createAndInit();
    expect(routerStub.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true });
  });
});
