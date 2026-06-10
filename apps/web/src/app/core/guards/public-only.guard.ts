import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const publicOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.session$.value) return router.createUrlTree(['/dashboard']);

  return auth.initialized$.pipe(
    filter(Boolean),
    take(1),
    map(() => auth.session$.value ? router.createUrlTree(['/dashboard']) : true),
  );
};
