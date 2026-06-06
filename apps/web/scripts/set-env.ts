import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '../../.env') });

const isDev = process.argv.includes('--dev');

const get = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`[set-env] Required env var "${key}" is not set`);
  return val;
};

const content = `export const environment = {
  production: ${!isDev},
  supabaseUrl: '${get('SUPABASE_URL')}',
  supabasePublishableKey: '${get('SUPABASE_PUBLISHABLE_KEY')}',
  apiUrl: '${get('API_URL')}',
  wsUrl: '${get('WS_URL')}',
};
`;

const filename = 'environment.ts';
const target = resolve(process.cwd(), `src/environments/${filename}`);
writeFileSync(target, content, 'utf8');
console.log('[set-env] Wrote', target);
