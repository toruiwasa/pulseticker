import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { SupabaseModule } from '../supabase/supabase.module';
import { HealthController } from './health/health.controller';
import { SupabaseHealthIndicator } from './supabase.health';

@Module({
  imports: [TerminusModule, SupabaseModule],
  controllers: [HealthController],
  providers: [SupabaseHealthIndicator],
})
export class HealthModule {}
