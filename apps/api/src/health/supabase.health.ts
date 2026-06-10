import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { SupabaseService } from '../supabase/supabase/supabase.service';

@Injectable()
export class SupabaseHealthIndicator extends HealthIndicator {
  constructor(private supabase: SupabaseService) {
    super();
  }

  async isHealthy(key = 'supabase'): Promise<HealthIndicatorResult> {
    const { error } = await this.supabase.client
      .from('watchlist_items')
      .select('id')
      .limit(1);

    if (error) {
      throw new HealthCheckError('Supabase ping failed', this.getStatus(key, false, { message: error.message }));
    }

    return this.getStatus(key, true);
  }
}
