import { InjectionToken } from '@angular/core';
import { environment } from '../../environments/environment';

export type Environment = typeof environment;

/**
 * DI handle for the build-generated environment.
 *
 * environment.ts is gitignored and produced by scripts/set-env.ts from the
 * repo-root .env, so a spec asserting against its contents inherits whatever
 * the developer (or CI) last generated. Services that need environment values
 * in a way their specs must control inject this token; TestBed then supplies
 * explicit values per test. Direct import of `environment` stays fine for
 * services whose specs never assert on it.
 *
 * vi.mock() was the first choice and is not available here: the Angular
 * unit-test builder rejects it for relative imports ("Please use Angular
 * TestBed for mocking dependencies"), which is exactly what this token enables.
 */
export const ENVIRONMENT = new InjectionToken<Environment>('ENVIRONMENT', {
  providedIn: 'root',
  factory: () => environment,
});
