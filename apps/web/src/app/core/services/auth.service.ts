import { Injectable, inject, signal } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // detectSessionInUrl: false — we exchange the code manually in CallbackComponent.
  // Otherwise Supabase calls history.replaceState() asynchronously and races with router.navigate.
  private supabase: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    { auth: { detectSessionInUrl: false, flowType: 'pkce' } },
  );
  private logger = inject(LoggerService);

  session     = signal<Session | null>(null);
  initialized = signal(false);

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.logger.debug('AUTH', `event: ${event}`, { hasSession: !!session });
      this.session.set(session);
      this.initialized.set(true);
    });
  }

  signInWithGitHub() {
    this.logger.info('AUTH', 'signInWithGitHub started');
    return this.signInWithOAuth('github');
  }

  signInWithGoogle() {
    this.logger.info('AUTH', 'signInWithGoogle started');
    return this.signInWithOAuth('google');
  }

  private signInWithOAuth(provider: 'github' | 'google') {
    return this.supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  signOut() {
    this.logger.info('AUTH', 'signOut called');
    return this.supabase.auth.signOut();
  }

  async exchangeCode(code: string): Promise<Session | null> {
    this.logger.debug('AUTH', 'exchangeCode: starting PKCE exchange');

    const { data, error } = await this.supabase.auth.exchangeCodeForSession(code);

    if (error) {
      this.logger.errorWithCause('AUTH', 'exchangeCode: failed', error);
      return null;
    }

    if (data.session) {
      this.session.set(data.session);
      this.initialized.set(true);
      this.logger.info('AUTH', 'exchangeCode: session established', { hasSession: true });
    } else {
      this.logger.warn('AUTH', 'exchangeCode: no session returned');
    }

    return data.session;
  }
}
