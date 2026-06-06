import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase: SupabaseClient = createClient(environment.supabaseUrl, environment.supabasePublishableKey);
  session$ = new BehaviorSubject<Session | null>(null);

  constructor() {
    this.supabase.auth.getSession().then(({ data }) => this.session$.next(data.session));
    this.supabase.auth.onAuthStateChange((_, session) => this.session$.next(session));
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
    const { data } = await this.supabase.auth.getSession();
    return data.session;
  }
}
