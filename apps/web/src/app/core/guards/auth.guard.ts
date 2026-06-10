import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // session$ is already set (e.g. just returned from handleCallback) — allow immediately.
  if (auth.session$.value) return true;

  // Fresh load: wait for INITIAL_SESSION, then read session$.value synchronously.
  // session$ is updated before initialized$ in onAuthStateChange, so .value is safe here.
  return auth.initialized$.pipe(
    filter(Boolean),
    take(1),
    map(() => auth.session$.value ? true : router.createUrlTree(['/'])),
  );
};
