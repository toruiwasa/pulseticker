import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { filter, firstValueFrom, take, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoggerService } from './logger.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient = createClient(environment.supabaseUrl, environment.supabasePublishableKey);
  private logger = inject(LoggerService);

  session     = signal<Session | null>(null);
  initialized = signal(false);

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      const hasCode = window.location.search.includes('code=');
      this.logger.debug('AUTH', `event: ${event}`, { hasSession: !!session, hasCode });

      this.session.set(session);

      // Don't mark as initialized until SIGNED_IN when a PKCE code exchange is in progress.
      // INITIAL_SESSION fires before the exchange completes, so the session would be null.
      if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && !hasCode)) {
        this.initialized.set(true);
      }
    });
  }

  signInWithGitHub() {
    this.logger.info('AUTH', 'signInWithGitHub started');
    return this.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  signOut() {
    this.logger.info('AUTH', 'signOut called');
    return this.supabase.auth.signOut();
  }

  async handleCallback(): Promise<Session | null> {
    this.logger.debug('AUTH', 'handleCallback: checking current session');

    if (this.session()) {
      this.logger.info('AUTH', 'handleCallback: session already established', { hasSession: true });
      return this.session();
    }

    try {
      const session = await firstValueFrom(
        toObservable(this.session).pipe(
          filter(s => s !== null),
          timeout(10000),
          take(1)
        )
      );
      this.logger.info('AUTH', 'handleCallback: session established via event', { hasSession: true });
      return session;
    } catch {
      this.logger.warn('AUTH', 'handleCallback: event timeout, falling back to getSession()');
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) {
        this.logger.errorWithCause('AUTH', 'handleCallback: getSession failed', error);
        return null;
      }
      if (session) {
        this.session.set(session);
        this.initialized.set(true);
        this.logger.info('AUTH', 'handleCallback: session established via getSession()', { hasSession: true });
      } else {
        this.logger.warn('AUTH', 'handleCallback: no session returned');
      }
      return session;
    }
  }
}
