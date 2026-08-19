import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Database } from '@pulseticker/schemas';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  /**
   * Typed against the `public` schema so rows arrive as real types rather than
   * `any`. Without the generic every property access on a row is an
   * `@typescript-eslint/no-unsafe-member-access` error, which is what made
   * `pnpm --filter api lint` unreadable.
   */
  readonly client: SupabaseClient<Database>;

  constructor(private config: ConfigService) {
    this.client = createClient<Database>(
      config.getOrThrow('SUPABASE_URL'),
      config.getOrThrow('SUPABASE_SECRET_KEY'),
    );
  }
}
