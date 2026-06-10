import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject, filter, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient = createClient(environment.supabaseUrl, environment.supabasePublishableKey);
  session$ = new BehaviorSubject<Session | null>(null);
  initialized$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.session$.next(session);
      if (event === 'INITIAL_SESSION') this.initialized$.next(true);
    });
  }

  signInWithGitHub() {
    return this.supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  signOut() {
    return this.supabase.auth.signOut();
  }

  async handleCallback() {
    await firstValueFrom(this.initialized$.pipe(filter(Boolean)));
    return this.session$.value;
  }
}
