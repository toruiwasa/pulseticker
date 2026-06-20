const mockOnAuthStateChange    = vi.hoisted(() => vi.fn());
const mockSignInWithOAuth      = vi.hoisted(() => vi.fn());
const mockSignOut              = vi.hoisted(() => vi.fn());
const mockExchangeCodeForSession = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange:      mockOnAuthStateChange,
      signInWithOAuth:        mockSignInWithOAuth,
      signOut:                mockSignOut,
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  }),
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { LoggerService } from './logger.service';
import { AuthService } from './auth.service';

const loggerStub = {
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
  warnWithCause: vi.fn(), errorWithCause: vi.fn(),
};

describe('AuthService', () => {
  let service: AuthService;
  let authStateCb: (event: string, session: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: LoggerService, useValue: loggerStub },
      ],
    });

    service = TestBed.inject(AuthService);
    // Capture the handler registered in the constructor
    authStateCb = mockOnAuthStateChange.mock.calls[0][0] as (e: string, s: unknown) => void;
  });

  it('registers onAuthStateChange listener during construction', () => {
    expect(mockOnAuthStateChange).toHaveBeenCalledOnce();
  });

  it('session() is null before any auth event fires', () => {
    expect(service.session()).toBeNull();
  });

  it('initialized() is false before any auth event fires', () => {
    expect(service.initialized()).toBe(false);
  });

  it('updates session signal and sets initialized on SIGNED_IN', () => {
    const fakeSession = { access_token: 'tok', user: { id: 'u1' } };
    authStateCb('SIGNED_IN', fakeSession);
    expect(service.session()).toEqual(fakeSession);
    expect(service.initialized()).toBe(true);
  });

  it('clears session on SIGNED_OUT and keeps initialized true', () => {
    authStateCb('SIGNED_IN', { access_token: 'tok' });
    authStateCb('SIGNED_OUT', null);
    expect(service.session()).toBeNull();
    expect(service.initialized()).toBe(true);
  });

  describe('signInWithGitHub()', () => {
    it('calls signInWithOAuth with provider "github" and /auth/callback redirectTo', () => {
      mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
      service.signInWithGitHub();
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'github',
          options: expect.objectContaining({
            redirectTo: expect.stringContaining('/auth/callback'),
          }),
        }),
      );
    });

    it('does not call signInWithOAuth with provider "google"', () => {
      mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
      service.signInWithGitHub();
      expect(mockSignInWithOAuth).not.toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' }),
      );
    });
  });

  describe('signInWithGoogle()', () => {
    it('calls signInWithOAuth with provider "google" and /auth/callback redirectTo', () => {
      mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
      service.signInWithGoogle();
      expect(mockSignInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          options: expect.objectContaining({
            redirectTo: expect.stringContaining('/auth/callback'),
          }),
        }),
      );
    });

    it('does not call signInWithOAuth with provider "github"', () => {
      mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
      service.signInWithGoogle();
      expect(mockSignInWithOAuth).not.toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'github' }),
      );
    });
  });

  describe('signOut()', () => {
    it('calls supabase signOut', () => {
      mockSignOut.mockResolvedValue({ error: null });
      service.signOut();
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
  });

  describe('exchangeCode()', () => {
    it('calls exchangeCodeForSession with the provided code', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
      await service.exchangeCode('my-code');
      expect(mockExchangeCodeForSession).toHaveBeenCalledWith('my-code');
    });

    it('returns the session on success', async () => {
      const fakeSession = { access_token: 'tok' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: fakeSession }, error: null });
      const result = await service.exchangeCode('code');
      expect(result).toEqual(fakeSession);
    });

    it('returns null and calls errorWithCause when exchange fails', async () => {
      const err = { message: 'invalid code', name: 'AuthApiError' };
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: err });
      const result = await service.exchangeCode('bad-code');
      expect(result).toBeNull();
      expect(loggerStub.errorWithCause).toHaveBeenCalledOnce();
    });

    it('returns null when exchange returns no session', async () => {
      mockExchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
      const result = await service.exchangeCode('code');
      expect(result).toBeNull();
    });
  });
});
