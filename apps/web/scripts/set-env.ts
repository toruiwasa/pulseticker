import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '../../.env') });

type AppEnv = 'development' | 'staging' | 'production';
const LOG_LEVEL_MAP: Record<AppEnv, string> = {
  development: 'debug',
  staging:     'info',
  production:  'warn',
};

const get = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`[set-env] Required env var "${key}" is not set`);
  return val;
};

const appEnv = (process.env['APP_ENV'] ?? 'production') as AppEnv;
const logLevel = LOG_LEVEL_MAP[appEnv] ?? 'warn';
const isProduction = appEnv === 'production';

const content = `export const environment = {
  production: ${isProduction},
  appEnv: '${appEnv}',
  logLevel: '${logLevel}',
  supabaseUrl: '${get('SUPABASE_URL')}',
  supabasePublishableKey: '${get('SUPABASE_PUBLISHABLE_KEY')}',
  apiUrl: '${get('API_URL')}',
  wsUrl: '${get('WS_URL')}',
};
`;

const target = resolve(process.cwd(), 'src/environments/environment.ts');
writeFileSync(target, content, 'utf8');
console.log('[set-env] Wrote', target);
