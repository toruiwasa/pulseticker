import { render, screen } from '@testing-library/react-native';
import SmokeScreen from '../app/index';

/**
 * Jest-side counterpart to the Metro smoke test (Task 7 / #10).
 *
 * Lives outside `app/` on purpose. Expo Router treats every file under the
 * router directory as a route — its require.context regex (expo-router/_ctx.*)
 * excludes only `+api` / `+html` / `+middleware`, and getRoutesCore's ignore
 * list adds nothing for tests — so `app/__tests__/index.test.tsx` compiled to a
 * real `/__tests__/index.test` route and pulled @testing-library/react-native
 * into the app bundle. #105 moved it here; `typedRoutes` made it visible.
 *
 * Metro proves the workspace packages resolve for the app bundle; this proves
 * they also resolve under jest-resolve, which is a separate resolver with
 * different rules — it needs the moduleNameMapper in jest.config.js because
 * @pulseticker/* are ESM-only. A regression in either resolver surfaces here
 * rather than in a later task's unrelated test run.
 *
 * Note for later tasks: react-native-testing-library v14 made `render()`
 * async. It must be awaited or every query on the result is undefined.
 */
describe('scaffold smoke screen', () => {
  it('resolves @pulseticker/schemas', async () => {
    await render(<SmokeScreen />);
    expect(screen.getByTestId('schemas-check')).toHaveTextContent(
      '@pulseticker/schemas: resolved',
    );
  });

  it('resolves @pulseticker/logging and sanitize() redacts access_token', async () => {
    await render(<SmokeScreen />);
    expect(screen.getByTestId('logging-check')).toHaveTextContent(
      '@pulseticker/logging: resolved',
    );
  });
});
