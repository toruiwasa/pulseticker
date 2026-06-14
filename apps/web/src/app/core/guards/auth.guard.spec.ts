import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { authGuard } from './auth.guard';

const fakeRoute = {} as never;
const fakeState = {} as never;

describe('authGuard', () => {
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

  it('returns true when initialized and session exists', () => {
    sessionSig.set({ access_token: 'tok' });
    const result = TestBed.runInInjectionContext(() => authGuard(fakeRoute, fakeState));
    expect(result).toBe(true);
  });

  it('returns a UrlTree for "/" when initialized but session is null', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(fakeRoute, fakeState));
    expect(routerStub.createUrlTree).toHaveBeenCalledWith(['/']);
    expect(result).toBe(urlTree);
  });
});
