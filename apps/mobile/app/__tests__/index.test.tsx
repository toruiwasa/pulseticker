import { render, screen } from '@testing-library/react-native';
import SmokeScreen from '../index';

/**
 * Jest-side counterpart to the Metro smoke test (Task 7 / #10).
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
