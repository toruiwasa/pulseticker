import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.initialized()) {
    return auth.session() ? true : router.createUrlTree(['/']);
  }

  return toObservable(auth.initialized).pipe(
    filter(Boolean),
    take(1),
    map(() => auth.session() ? true : router.createUrlTree(['/'])),
  );
};
