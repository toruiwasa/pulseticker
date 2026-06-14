import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { publicOnlyGuard } from './public-only.guard';

const fakeRoute = {} as never;
const fakeState = {} as never;

describe('publicOnlyGuard', () => {
  let sessionSig: ReturnType<typeof signal<object | null>>;
  let urlTree: object;
  let routerStub: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    urlTree = {};
    sessionSig = signal<object | null>(null);
    routerStub = { createUrlTree: vi.fn().mockReturnValue(urlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session: sessionSig, initialized: signal(true) } },
        { provide: Router, useValue: routerStub },
      ],
    });
  });

  it('returns true when not authenticated', () => {
    const result = TestBed.runInInjectionContext(() => publicOnlyGuard(fakeRoute, fakeState));
    expect(result).toBe(true);
  });

  it('returns a UrlTree for "/dashboard" when authenticated', () => {
    sessionSig.set({ access_token: 'tok' });
    const result = TestBed.runInInjectionContext(() => publicOnlyGuard(fakeRoute, fakeState));
    expect(routerStub.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe(urlTree);
  });
});
